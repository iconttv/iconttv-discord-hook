import assert from 'node:assert/strict';
import { test } from 'node:test';
import { once } from 'node:events';
import { resolve } from 'node:path';
import { PermissionFlagsBits } from 'discord.js';
import { createWebServer } from '../src/web/app';
import { signSessionToken, verifySessionToken } from '../src/web/sessionToken';
import { getWebCapabilities } from '../src/web/permissions';
import { formatWebError } from '../src/web/diagnostics';
import { getWebConfiguration } from '../src/service/webSessionService';
import { config } from '../src/config';
import type { WebSession, WebSearchOptions } from '../src/web/types';

const secret = 'test-only-secret-not-for-deployment-0123456789';
const id = '45cbeb98-36c7-429b-8632-ec2047873fbc';

test('development supports LAN HTTP origins while production requires HTTPS', () => {
  const original = { ...config };
  try {
    Object.assign(config, {
      ENV: 'dev',
      WEB_PUBLIC_URL: 'http://192.168.0.201:3011',
      WEB_SESSION_SECRET: secret,
      WEB_SESSION_TTL_SECONDS: '1800',
    });
    assert.equal(getWebConfiguration().origin, 'http://192.168.0.201:3011');
    config.ENV = 'prod';
    assert.throws(() => getWebConfiguration(), /HTTPS origin/);
    config.WEB_PUBLIC_URL = 'https://iconttv-discord.example';
    assert.equal(
      getWebConfiguration().origin,
      'https://iconttv-discord.example'
    );
    config.WEB_PUBLIC_URL += '/search';
    assert.throws(() => getWebConfiguration(), /without a path/);
  } finally {
    Object.assign(config, original);
  }
});

test('diagnostics preserve the cause without credentials or Mongo connection URIs', () => {
  const message = formatWebError(
    new Error(
      'Connection failed mongodb://user:password@host/db; key=sensitive-key; value=p%40ssword'
    ),
    ['sensitive-key', 'p@ssword']
  );
  assert.match(message, /Connection failed/);
  assert.doesNotMatch(
    message,
    /user:password|host\/db|sensitive-key|p%40ssword/
  );
});

test('signed token rejects forgery, truncation, wrong audience and exact expiry', () => {
  const expiry = new Date(100000);
  const token = signSessionToken(id, expiry, secret);
  assert.equal(verifySessionToken(token, secret, 99999)?.sid, id);
  assert.equal(verifySessionToken(token, secret, 100000), null);
  assert.equal(verifySessionToken(token, secret + 'other', 1), null);
  assert.equal(
    verifySessionToken(token.split('.')[0] + '.abc', secret, 1),
    null
  );
  assert.equal(verifySessionToken('extra.' + token, secret, 1), null);
  const tampered =
    Buffer.from(
      JSON.stringify({ sid: id, exp: 999999, aud: 'other-app' })
    ).toString('base64url') +
    '.' +
    token.split('.')[1];
  assert.equal(verifySessionToken(tampered, secret, 1), null);
  assert.throws(() => signSessionToken(id, expiry, 'weak'));
});

test('Discord permissions, including Administrator, determine settings capability', () => {
  assert.deepEqual(getWebCapabilities({ permissions: '0' }), []);
  assert.deepEqual(getWebCapabilities({ permissions: 'malformed' }), []);
  assert.deepEqual(
    getWebCapabilities({
      permissions: PermissionFlagsBits.ModerateMembers.toString(),
    }),
    ['settings:write']
  );
  assert.deepEqual(
    getWebCapabilities({
      permissions: PermissionFlagsBits.Administrator.toString(),
    }),
    ['settings:write']
  );
  assert.deepEqual(
    getWebCapabilities({
      permissions: PermissionFlagsBits.ManageMessages.toString(),
    }),
    []
  );
});

test('HTTP session, channel boundaries, optional keyword, paging and settings authorization', async t => {
  const searches: { session: WebSession; options: WebSearchOptions }[] = [];
  const writes: unknown[] = [];
  let healthy = true;
  const session: WebSession = {
    id,
    userId: '200',
    displayName: '테스터',
    avatarUrl: '',
    guildId: '100',
    guildName: '테스트 서버',
    guildIconUrl: '',
    initialChannelId: '300',
    channels: [{ id: '300', name: '공개', category: '' }],
    permissions: '0',
    expiresAt: new Date(Date.now() + 60000),
  };
  const server = createWebServer({
    origin: 'https://example.test',
    assets: resolve('web'),
    isHealthy: () => healthy,
    findSession: async token =>
      token === 'reader'
        ? session
        : token === 'moderator'
          ? {
              ...session,
              permissions: PermissionFlagsBits.ModerateMembers.toString(),
            }
          : token === 'expired'
            ? { ...session, expiresAt: new Date(0) }
            : null,
    search: async (session, options) => {
      searches.push({ session, options });
      return {
        messages: [],
        total: 0,
        page: options.page,
        hasMore: false,
        source: 'elasticsearch',
      };
    },
    getSettings: async () => ({
      enableFeatureIconImageResize: false,
      enableCommandQuestionForEveryone: false,
    }),
    saveSettings: async (...args) => {
      writes.push(args);
    },
    onError: () => {},
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => {
    server.closeAllConnections();
    server.close();
  });
  const address = server.address();
  assert(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}`;
  const request = (path: string, token = 'reader', init: RequestInit = {}) =>
    fetch(base + path, {
      ...init,
      headers: {
        Cookie: `itv_session=${token}`,
        Origin: 'https://example.test',
        'Content-Type': 'application/json',
        ...init.headers,
      },
    });

  const health = await fetch(base + '/health');
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), {
    status: 'ok',
    service: 'iconttv-discord-web',
  });
  healthy = false;
  assert.equal((await fetch(base + '/health')).status, 503);
  healthy = true;
  for (const asset of ['/message-format.js', '/discord-links.js']) {
    const response = await fetch(base + asset);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type')!, /javascript/);
  }
  assert.equal((await fetch(base + '/api/search')).status, 401);
  assert.equal((await request('/api/search', 'expired')).status, 401);
  assert.equal(
    (
      await request('/api/session', 'none', {
        method: 'POST',
        body: JSON.stringify({ token: 'reader' }),
        headers: { Origin: 'https://evil.test' },
      })
    ).status,
    403
  );
  const login = await request('/api/session', 'none', {
    method: 'POST',
    body: JSON.stringify({ token: 'reader' }),
  });
  assert.equal(login.status, 200);
  assert.match(
    login.headers.get('set-cookie')!,
    /HttpOnly; SameSite=Lax; Max-Age=\d+; Secure/
  );
  const profile = await (await request('/api/session')).json();
  assert.equal(profile.id, undefined);
  assert.equal(profile.permissions, '0');
  assert.deepEqual(profile.capabilities, []);
  assert.equal((await request('/api/search?channelId=private')).status, 403);
  assert.equal(searches.length, 0);
  assert.equal(
    (await request('/api/search?keyword=%20%20&embedding=true&guildId=other'))
      .status,
    200
  );
  assert.equal(searches[0].session.guildId, '100');
  assert.equal(searches[0].options.keyword, '');
  assert.equal(searches[0].options.mode, 'text');
  assert.equal(searches[0].options.sort, 'newest');
  assert.equal(searches[0].options.channelId, '300');
  assert.equal(
    (
      await request(
        '/api/search?keyword=test&channelId=300&embedding=true&page=2'
      )
    ).status,
    200
  );
  assert.equal(searches[1].options.mode, 'semantic');
  assert.equal(searches[1].options.channelId, '300');
  assert.equal(searches[1].options.page, 2);
  assert.equal((await request('/api/search?allChannels=true')).status, 200);
  assert.equal(searches[2].options.channelId, undefined);
  assert.equal(
    (await request('/api/search?allChannels=true&channelId=private')).status,
    403
  );
  for (const query of [
    'page=0',
    'page=101',
    'page=1.2',
    'embedding=yes',
    'allChannels=yes',
    'after=2026-02-30',
    'after=2026-11-01&before=2026-10-01',
  ]) {
    assert.equal((await request('/api/search?' + query)).status, 400, query);
  }
  assert.equal((await request('/api/settings')).status, 403);
  assert.equal(
    (await request('/api/settings', 'reader', { method: 'PUT', body: '{}' }))
      .status,
    403
  );
  const settings = {
    enableFeatureIconImageResize: true,
    enableCommandQuestionForEveryone: false,
  };
  assert.equal(
    (
      await request('/api/settings', 'moderator', {
        method: 'PUT',
        body: JSON.stringify({ ...settings, guildId: 'other' }),
      })
    ).status,
    400
  );
  assert.equal(
    (
      await request('/api/settings', 'moderator', {
        method: 'PUT',
        body: JSON.stringify(settings),
      })
    ).status,
    200
  );
  assert.deepEqual(writes, [['100', '200', settings]]);
  const shell = await fetch(base + '/search?token=secret');
  assert.equal(shell.status, 200);
  assert.match(
    shell.headers.get('content-security-policy')!,
    /frame-ancestors 'none'/
  );
  assert.equal(shell.headers.get('referrer-policy'), 'no-referrer');
  assert.equal(shell.headers.get('cache-control'), 'no-store');
  assert.equal(shell.headers.get('cloudflare-cdn-cache-control'), 'no-store');
  const html = await shell.text();
  assert.equal(html.includes('secret'), false);
  const script = html.match(/src="(\/assets\/[a-f0-9]{16}\/app.js)"/)?.[1];
  assert(script);
  const module = await fetch(base + script);
  assert.equal(module.status, 200);
  assert.match(module.headers.get('content-type')!, /javascript/);
  assert.equal(
    module.headers.get('x-web-asset-version'),
    shell.headers.get('x-web-asset-version')
  );
  assert.equal((await fetch(base + '/.env')).status, 404);
  const logout = await request('/api/session', 'reader', { method: 'DELETE' });
  assert.match(logout.headers.get('set-cookie')!, /Max-Age=0/);
});
