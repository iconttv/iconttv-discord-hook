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
    accessResolvedAt: new Date(),
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
  assert.equal(profile.accessStatus, 'ready');
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
  const version = shell.headers.get('x-web-asset-version');
  const assertNoCacheHeaders = (response: Response) => {
    for (const header of [
      'cache-control',
      'cdn-cache-control',
      'cloudflare-cdn-cache-control',
    ])
      assert.equal(response.headers.get(header), null);
  };
  for (const file of [
    'app.js',
    'style.css',
    'message-format.js',
    'discord-links.js',
    'message-images.js',
    'favicon.svg',
  ]) {
    for (const method of ['GET', 'HEAD']) {
      const asset = await fetch(`${base}/assets/${version}/${file}`, {
        method,
      });
      assert.equal(asset.status, 200);
      assertNoCacheHeaders(asset);
      assert.equal(asset.headers.get('set-cookie'), null);
    }
  }
  assertNoCacheHeaders(shell);
  assertNoCacheHeaders(login);
  for (const path of [
    '/app.js',
    '/style.css',
    '/health',
    '/api/session',
    '/api/search',
    '/api/settings',
    '/assets/0000000000000000/app.js',
    `/assets/${version}/index.html`,
  ]) {
    assertNoCacheHeaders(await request(path));
  }
  const unauthorized = await fetch(base + '/api/search');
  assert.equal(unauthorized.status, 401);
  assertNoCacheHeaders(unauthorized);
  assert.equal((await fetch(base + '/.env')).status, 404);
  const logout = await request('/api/session', 'reader', { method: 'DELETE' });
  assert.match(logout.headers.get('set-cookie')!, /Max-Age=0/);
});

test('session polling reads pending, ready and failed snapshots without initializing permissions', async t => {
  let snapshot: WebSession = {
    id,
    userId: '200',
    displayName: '테스터',
    avatarUrl: '',
    guildId: '100',
    guildName: '테스트 서버',
    guildIconUrl: '',
    initialChannelId: '300',
    channels: [{ id: '300', name: '비공개', category: '비공개 카테고리' }],
    permissions: PermissionFlagsBits.Administrator.toString(),
    expiresAt: new Date(Date.now() + 60000),
  };
  const calls = { search: 0, avatars: 0, getSettings: 0, saveSettings: 0 };
  const settings = {
    enableFeatureIconImageResize: false,
    enableCommandQuestionForEveryone: false,
  };
  const server = createWebServer({
    origin: 'https://example.test',
    assets: resolve('web'),
    findSession: async token => (token === 'valid' ? { ...snapshot } : null),
    search: async session => {
      calls.search++;
      assert.deepEqual(session.channels, snapshot.channels);
      return {
        messages: [],
        total: 0,
        page: 1,
        hasMore: false,
        source: 'elasticsearch',
      };
    },
    avatars: async () => {
      calls.avatars++;
      return {};
    },
    getSettings: async () => {
      calls.getSettings++;
      return settings;
    },
    saveSettings: async () => {
      calls.saveSettings++;
    },
    onError: error => assert.fail(String(error)),
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
  const request = (path: string, init: RequestInit = {}) =>
    fetch(base + path, {
      ...init,
      headers: {
        Cookie: 'itv_session=valid',
        Origin: 'https://example.test',
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(5000),
    });
  const assertBlocked = async (status: 'pending' | 'failed') => {
    const response = await request('/api/session');
    assert.equal(response.status, 200);
    const profile = await response.json();
    assert.equal(profile.accessStatus, status);
    assert.equal(profile.id, undefined);
    assert.equal(profile.initialChannelId, undefined);
    assert.deepEqual(profile.channels, []);
    assert.equal(profile.permissions, '0');
    assert.deepEqual(profile.capabilities, []);
    for (const [path, init] of [
      ['/api/search', {}],
      [
        '/api/avatars',
        {
          method: 'POST',
          body: JSON.stringify({ messages: [{ id: '400', channelId: '300' }] }),
        },
      ],
      ['/api/settings', {}],
      ['/api/settings', { method: 'PUT', body: JSON.stringify(settings) }],
    ] satisfies [string, RequestInit][]) {
      const blocked = await request(path, init);
      assert.equal(blocked.status, 503, path);
      assert.equal(
        blocked.headers.get('retry-after'),
        status === 'pending' ? '1' : null,
        path
      );
      if (status === 'failed')
        assert.match((await blocked.json()).error, /디스코드에서 새 링크/);
    }
  };

  const login = await request('/api/session', {
    method: 'POST',
    body: JSON.stringify({ token: 'valid' }),
  });
  assert.equal(login.status, 200);
  assert.deepEqual(await login.json(), { ok: true });
  assert.match(login.headers.get('set-cookie')!, /itv_session=valid;/);
  await assertBlocked('pending');
  assert.deepEqual(calls, {
    search: 0,
    avatars: 0,
    getSettings: 0,
    saveSettings: 0,
  });

  snapshot = { ...snapshot, accessPartialAt: new Date() };
  const partial = await (await request('/api/session')).json();
  assert.equal(partial.accessStatus, 'partial');
  assert.equal(partial.channelsStatus, 'pending');
  assert.deepEqual(partial.channels, snapshot.channels);
  assert.deepEqual(partial.capabilities, ['settings:write']);
  assert.equal((await request('/api/search?channelId=300')).status, 200);
  assert.equal((await request('/api/search')).status, 200);
  assert.equal((await request('/api/search?allChannels=true')).status, 503);
  assert.equal((await request('/api/search?channelId=999')).status, 403);
  assert.equal((await request('/api/avatars', {
    method: 'POST',
    body: JSON.stringify({ messages: [{ id: '400', channelId: '300' }] }),
  })).status, 200);
  assert.equal((await request('/api/avatars', {
    method: 'POST',
    body: JSON.stringify({ messages: [{ id: '400', channelId: '999' }] }),
  })).status, 403);
  assert.equal(calls.search, 2, 'partial access cannot invoke a full-scope search');
  snapshot = { ...snapshot, channelsFailedAt: new Date() };
  const degraded = await (await request('/api/session')).json();
  assert.equal(degraded.accessStatus, 'partial');
  assert.equal(degraded.channelsStatus, 'failed');
  assert.equal((await request('/api/search?allChannels=true')).status, 503);
  assert.equal((await request('/api/search?channelId=300')).status, 200);
  snapshot = { ...snapshot, channelsFailedAt: undefined };

  // Only the bot updates the database snapshot; the next poll observes it.
  snapshot = { ...snapshot, accessResolvedAt: new Date() };
  const readyResponse = await request('/api/session');
  assert.equal(readyResponse.status, 200);
  const ready = await readyResponse.json();
  assert.equal(ready.accessStatus, 'ready');
  assert.deepEqual(ready.channels, snapshot.channels);
  assert.equal(ready.permissions, snapshot.permissions);
  assert.deepEqual(ready.capabilities, ['settings:write']);
  assert.equal((await request('/api/search')).status, 200);
  assert.equal(calls.search, 4);

  // Failure takes precedence even when an older successful snapshot remains.
  snapshot = { ...snapshot, accessFailedAt: new Date() };
  await assertBlocked('failed');
  assert.deepEqual(calls, {
    search: 4,
    avatars: 1,
    getSettings: 0,
    saveSettings: 0,
  });
});
