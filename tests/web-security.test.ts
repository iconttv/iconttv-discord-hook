import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { once } from 'node:events';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { test } from 'node:test';
import { PermissionFlagsBits } from 'discord.js';
import { createWebServer } from '../src/web/app';
import { verifySessionToken } from '../src/web/sessionToken';
import type { WebSession } from '../src/web/types';

test('signed tokens still reject invalid audience, identity, expiry and types', () => {
  const secret = 'security-test-only-01234567890123456789';
  const valid = {
    sid: '45cbeb98-36c7-429b-8632-ec2047873fbc',
    exp: 2000,
    aud: 'iconttv-web',
  };
  for (const change of [
    { aud: 'other' },
    { sid: { $ne: null } },
    { exp: '2000' },
    { exp: 1 },
    { exp: 1.5 },
  ]) {
    const data = Buffer.from(JSON.stringify({ ...valid, ...change })).toString(
      'base64url'
    );
    const signature = createHmac('sha256', secret)
      .update(data)
      .digest('base64url');
    assert.equal(
      verifySessionToken(`${data}.${signature}`, secret, 1000),
      null
    );
  }
});

test('HTTP blocks CSRF, privilege injection, oversized requests and rate-limit bypass across tokens', async t => {
  const baseSession: WebSession = {
    id: 'base',
    userId: 'reader',
    displayName: 'reader',
    avatarUrl: '',
    guildId: '100',
    guildName: 'guild',
    guildIconUrl: '',
    channels: [{ id: '300', name: 'allowed', category: '' }],
    permissions: '0',
    expiresAt: new Date(Date.now() + 60000),
  };
  const pending: (() => void)[] = [];
  let searches = 0;
  let writes = 0;
  const server = createWebServer({
    origin: 'https://web.example',
    assets: resolve('web'),
    findSession: async token =>
      token === 'invalid'
        ? null
        : {
            ...baseSession,
            id: token,
            userId: token.split('-')[0],
            permissions:
              token === 'moderator'
                ? PermissionFlagsBits.ModerateMembers.toString()
                : '0',
          },
    search: async session => {
      searches++;
      if (session.userId === 'parallel')
        await new Promise<void>(resolve => pending.push(resolve));
      if (session.userId === 'error')
        throw new Error('internal credential test-secret must stay private');
      return {
        messages: [],
        page: 1,
        total: 0,
        hasMore: false,
        source: 'elasticsearch',
      };
    },
    getSettings: async () => ({
      enableFeatureIconImageResize: false,
      enableCommandQuestionForEveryone: false,
    }),
    saveSettings: async () => {
      writes++;
    },
    onError: () => {},
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => {
    pending.forEach(release => release());
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
        Origin: 'https://web.example',
        'Content-Type': 'application/json',
        ...init.headers,
      },
    });
  const settings = {
    enableFeatureIconImageResize: true,
    enableCommandQuestionForEveryone: true,
  };
  for (const origin of ['', 'https://evil.example', 'null']) {
    assert.equal(
      (
        await request('/api/settings', 'moderator', {
          method: 'PUT',
          headers: { Origin: origin },
          body: JSON.stringify(settings),
        })
      ).status,
      403
    );
  }
  for (const extra of [
    { guildId: 'other' },
    { permissions: '8' },
    { updatedBy: 'other' },
  ]) {
    assert.equal(
      (
        await request('/api/settings', 'moderator', {
          method: 'PUT',
          body: JSON.stringify({ ...settings, ...extra }),
        })
      ).status,
      400
    );
  }
  assert.equal(
    (
      await request('/api/settings', 'reader', {
        method: 'PUT',
        body: JSON.stringify(settings),
      })
    ).status,
    403
  );
  assert.equal(
    (await request('/api/session', 'invalid', { method: 'POST', body: '[]' }))
      .status,
    400
  );
  assert.equal(
    (
      await request('/api/session', 'invalid', {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: '{}',
      })
    ).status,
    415
  );
  assert.equal(
    (
      await request('/api/session', 'invalid', {
        method: 'POST',
        body: JSON.stringify({ token: 'x'.repeat(9000) }),
      })
    ).status,
    413
  );
  assert.equal((await request('/api/search?channelId=999')).status, 403);
  assert.equal(
    (await request('/api/search?channelId=%7B%22%24ne%22%3Anull%7D')).status,
    403
  );
  assert.equal(
    (await request('/api/search?keyword=' + 'x'.repeat(201))).status,
    400
  );
  assert.equal(searches, 0);
  assert.equal(writes, 0);
  const failure = await request('/api/search', 'error');
  assert.equal(failure.status, 503);
  assert.doesNotMatch(await failure.text(), /credential|test-secret|stack/);
  for (let index = 0; index < 30; index++)
    assert.equal((await request('/api/search', 'quota-first')).status, 200);
  const quota = await request('/api/search', 'quota-new-session');
  assert.equal(quota.status, 429);
  assert.equal(quota.headers.get('retry-after'), '60');
  assert.equal((await request('/api/search', 'another-user')).status, 200);
  const first = request('/api/search', 'parallel-first');
  const second = request('/api/search', 'parallel-second');
  for (let count = 0; pending.length < 2 && count < 100; count++)
    await delay(5);
  assert.equal(pending.length, 2);
  assert.equal((await request('/api/search', 'parallel-third')).status, 429);
  pending.splice(0).forEach(release => release());
  assert.deepEqual(
    (await Promise.all([first, second])).map(response => response.status),
    [200, 200]
  );
});
