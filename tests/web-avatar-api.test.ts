import assert from 'node:assert/strict';
import { test } from 'node:test';
import { once } from 'node:events';
import { createWebServer } from '../src/web/app';
import type { WebSession } from '../src/web/types';

test('avatar batches require readable message references and cannot delay or exhaust search requests', async t => {
  const session: WebSession = {
    id: 'session',
    userId: '200',
    guildId: '100',
    channels: [{ id: '400', name: 'allowed', category: '' }],
    displayName: 'reader',
    avatarUrl: '',
    guildName: 'test',
    guildIconUrl: '',
    permissions: '0',
    expiresAt: new Date(Date.now() + 60000),
  };
  let calls = 0;
  let release!: () => void;
  const gate = new Promise<void>(resolve => {
    release = resolve;
  });
  const server = createWebServer({
    origin: 'http://web.test',
    assets: '.',
    findSession: async token =>
      ['valid', 'another'].includes(token) ? session : null,
    search: async () => ({
      messages: [],
      total: 0,
      page: 1,
      hasMore: false,
      source: 'elasticsearch',
    }),
    avatars: async (scope, references) => {
      calls++;
      assert.equal(scope.guildId, '100');
      assert.deepEqual(references, [{ id: '300', channelId: '400' }]);
      await gate;
      return { '200': 'https://cdn.discordapp.com/avatars/200/hash.webp' };
    },
    getSettings: async () => ({
      enableCommandQuestionForEveryone: false,
      enableFeatureIconImageResize: false,
    }),
    saveSettings: async () => {},
    onError: error => {
      throw error;
    },
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    release();
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  });
  const address = server.address();
  if (!address || typeof address === 'string')
    throw new Error('Expected TCP address');
  const base = `http://127.0.0.1:${address.port}`;
  const body = { messages: [{ id: '300', channelId: '400' }] };
  const post = (
    value = body,
    cookie = 'itv_session=valid',
    origin = 'http://web.test'
  ) =>
    fetch(base + '/api/avatars', {
      method: 'POST',
      headers: {
        Origin: origin,
        Cookie: cookie,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(value),
    });
  assert.equal((await post(body, '')).status, 401);
  assert.equal(
    (await post(body, 'itv_session=valid', 'http://evil.test')).status,
    403
  );
  assert.equal(
    (await post({ messages: [{ id: '300', channelId: '999' }] })).status,
    403
  );
  assert.equal(
    (await post({ messages: [{ id: '../300', channelId: '400' }] })).status,
    400
  );
  assert.equal(
    (
      await post({
        messages: Array.from({ length: 26 }, () => body.messages[0]),
      })
    ).status,
    400
  );
  assert.equal(calls, 0);
  const pending = post();
  const search = await fetch(base + '/api/search', {
    headers: { Cookie: 'itv_session=valid' },
  });
  assert.equal(search.status, 200);
  assert.equal((await search.json()).total, 0);
  release();
  assert.equal((await pending).status, 200);
  for (let index = 1; index < 30; index++)
    assert.equal((await post()).status, 200);
  assert.equal((await post(body, 'itv_session=another')).status, 429);
  assert.equal(
    (
      await fetch(base + '/api/search', {
        headers: { Cookie: 'itv_session=valid' },
      })
    ).status,
    200
  );
});
