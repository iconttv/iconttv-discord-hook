import assert from 'node:assert/strict';
import { test } from 'node:test';
import { REST } from 'discord.js';
import { WebAvatarCache } from '../src/web/avatars';
import { archivedAvatar } from '../src/web/messagePresentation';
import { getWebAvatars } from '../src/service/webAvatarService';
import MessageModel from '../src/database/model/MessageModel';
import { config } from '../src/config';
import type { WebSearchMessage, WebSearchResult } from '../src/web/types';

const message = (
  senderId = '200',
  avatarUrl = archivedAvatar({}, senderId, '100')
): WebSearchMessage => ({
  id: '300',
  channelId: '400',
  channelName: 'allowed',
  senderId,
  senderName: 'member',
  avatarUrl,
  timestamp: new Date(0).toISOString(),
  content: 'message',
  link: 'https://discord.com/channels/100/400/300',
});

test('avatar URLs prefer guild profiles, support global and legacy defaults, and validate paths', () => {
  assert.equal(
    archivedAvatar(
      { member: { avatar: 'guild_hash' }, author: { avatar: 'global_hash' } },
      '200',
      '100'
    ),
    'https://cdn.discordapp.com/guilds/100/users/200/avatars/guild_hash.webp?size=128'
  );
  assert.equal(
    archivedAvatar({ author: { avatar: 'global_hash' } }, '200', '100'),
    'https://cdn.discordapp.com/avatars/200/global_hash.webp?size=128'
  );
  assert.equal(
    archivedAvatar(
      { author: { discriminator: '1234', avatar: null } },
      '200',
      '100'
    ),
    'https://cdn.discordapp.com/embed/avatars/4.png'
  );
  assert.match(
    archivedAvatar({ authorId: '200' }, '200', '100'),
    /embed\/avatars\/0.png$/
  );
  assert.match(
    archivedAvatar({ author: { avatar: '../evil' } }, '200', '100'),
    /embed\/avatars/
  );
});

test('avatar cache deduplicates authors within requests and in flight, and isolates guilds', async () => {
  let calls = 0;
  let now = 0;
  let release!: () => void;
  const gate = new Promise<void>(resolve => {
    release = resolve;
  });
  const cache = new WebAvatarCache(
    async (guildId, userId) => {
      calls++;
      await gate;
      return `https://cdn.discordapp.com/guilds/${guildId}/users/${userId}/avatars/hash.webp`;
    },
    {
      ttlMs: 3600000,
      failureTtlMs: 60000,
      timeoutMs: 1000,
      maxEntries: 20,
      maxPending: 10,
      now: () => now,
    }
  );
  const source = [message(), message()];
  const first = cache.resolve('100', source);
  const simultaneous = cache.resolve('100', source);
  await Promise.resolve();
  assert.equal(calls, 1);
  release();
  const [a, b] = await Promise.all([first, simultaneous]);
  assert.equal(a[0].avatarUrl, b[1].avatarUrl);
  assert.match(source[0].avatarUrl, /embed\/avatars/);
  now = 3599999;
  await cache.resolve('100', source);
  assert.equal(calls, 1);
  await cache.resolve('101', source);
  assert.equal(calls, 2);
  now = 3600000;
  await cache.resolve('100', source);
  assert.equal(calls, 3);
  await cache.resolve('100', [
    message('201', 'https://cdn.discordapp.com/avatars/201/stored.webp'),
    message('../invalid'),
  ]);
  assert.equal(calls, 3);
});

test('avatar failures are cached, lookup deadlines abort, and caches and pending work are bounded', async () => {
  let now = 0;
  let calls = 0;
  let aborted = false;
  const cache = new WebAvatarCache(
    async (_guildId, _userId, signal) => {
      calls++;
      signal.addEventListener('abort', () => {
        aborted = true;
      });
      return new Promise<string>(() => {});
    },
    {
      ttlMs: 3600000,
      failureTtlMs: 60000,
      timeoutMs: 15,
      maxEntries: 1,
      maxPending: 1,
      now: () => now,
    }
  );
  const [a, b] = await Promise.all([
    cache.resolve('100', [message()]),
    cache.resolve('100', [message('201')]),
  ]);
  assert.equal(calls, 1);
  assert.equal(aborted, true);
  assert.equal(a[0].avatarUrl, message().avatarUrl);
  assert.equal(b[0].avatarUrl, message('201').avatarUrl);
  now = 59999;
  await cache.resolve('100', [message()]);
  assert.equal(calls, 1);
  now = 60000;
  await cache.resolve('100', [message()]);
  assert.equal(calls, 2);
  await cache.resolve('100', [message('202')]);
  await cache.resolve('100', [message()]);
  assert.equal(calls, 4);
});

test('web profile enrichment uses scoped REST member lookup, former-member fallback and graceful failures', async t => {
  const original = config.DISCORD_BOT_TOKEN;
  t.after(() => {
    config.DISCORD_BOT_TOKEN = original;
  });
  const calls: string[] = [];
  t.mock.method(REST.prototype, 'get', async (route: string) => {
    calls.push(route);
    if (route === '/guilds/100/members/200')
      return { avatar: 'guild', user: { id: '200', avatar: 'global' } };
    if (route === '/guilds/100/members/201') throw { status: 404 };
    if (route === '/users/201') return { id: '201', avatar: 'former' };
    if (route === '/guilds/100/members/203')
      return { user: { id: '999', avatar: 'wrong' } };
    throw { status: 403 };
  });
  const result: WebSearchResult = {
    messages: [
      message(),
      message(),
      message('201'),
      message('202'),
      message('203'),
    ],
    page: 1,
    total: 5,
    hasMore: false,
    source: 'elasticsearch',
  };
  const scope = {
    guildId: '100',
    channels: [{ id: '400', name: 'allowed', category: '' }],
  };
  const references = [{ id: '300', channelId: '400' }];
  let filter: unknown;
  t.mock.method(MessageModel, 'find', (query: unknown) => {
    filter = query;
    const chain = {
      select: () => chain,
      maxTimeMS: () => chain,
      lean: async () =>
        result.messages.map(message => ({ senderId: message.senderId })),
    };
    return chain;
  });
  config.DISCORD_BOT_TOKEN = '';
  assert.deepEqual(await getWebAvatars(scope, references), {});
  assert.equal(calls.length, 0);
  config.DISCORD_BOT_TOKEN = 'synthetic-test-token';
  await assert.rejects(
    getWebAvatars(scope, [{ id: '300', channelId: '999' }]),
    /scope/
  );
  const first = await getWebAvatars(scope, references);
  assert.equal(
    first['200'],
    'https://cdn.discordapp.com/guilds/100/users/200/avatars/guild.webp?size=128'
  );
  assert.equal(
    first['201'],
    'https://cdn.discordapp.com/avatars/201/former.webp?size=128'
  );
  assert.ok(first['202'].includes('/embed/avatars/'));
  assert.ok(first['203'].includes('/embed/avatars/'));
  assert.deepEqual(filter, {
    guildId: '100',
    isDeleted: { $ne: true },
    $or: [{ channelId: '400', messageId: '300' }],
  });
  assert.deepEqual(
    calls.sort(),
    [
      '/guilds/100/members/200',
      '/guilds/100/members/201',
      '/guilds/100/members/202',
      '/guilds/100/members/203',
      '/users/201',
    ].sort()
  );
  assert.deepEqual(await getWebAvatars(scope, references), first);
  assert.equal(calls.length, 5);
});
