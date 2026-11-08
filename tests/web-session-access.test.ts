import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import {
  Client,
  REST,
  Routes,
  PermissionFlagsBits,
  PermissionsBitField,
  type Guild,
  type GuildBasedChannel,
} from 'discord.js';
import {
  createWebSessionAccessResolver,
  resolveWebSessionAccess,
} from '../src/service/webSessionAccessService';
import MessageModel from '../src/database/model/MessageModel';
import WebSessionModel from '../src/database/model/WebSessionModel';
import { createWebServer } from '../src/web/app';
import type { WebSession } from '../src/web/types';

const pendingSession = (): WebSession => ({
  id: 'session',
  userId: '200',
  guildId: '100',
  displayName: 'reader',
  avatarUrl: '',
  guildName: 'guild',
  guildIconUrl: '',
  initialChannelId: '300',
  channels: [],
  permissions: '0',
  expiresAt: new Date(Date.now() + 60000),
});
const readable =
  PermissionFlagsBits.ViewChannel | PermissionFlagsBits.ReadMessageHistory;

test('first web access resolves and persists issuer permissions, coalesces requests and denies private API searches', async t => {
  const session = pendingSession();
  let saved: WebSession | undefined;
  let loads = 0;
  let memberLoads = 0;
  let searches = 0;
  const member = {
    id: session.userId,
    displayName: 'current name',
    displayAvatarURL: () => '',
    permissions: new PermissionsBitField(readable),
  };
  const channels = ['300', '999'].map(id => ({
    id,
    name: id,
    parent: null,
    isTextBased: () => true,
    isThread: () => false,
    permissionsFor: () => new PermissionsBitField(id === '300' ? readable : 0n),
  })) as unknown as GuildBasedChannel[];
  const guild = {
    id: '100',
    name: 'current guild',
    iconURL: () => 'https://cdn.discordapp.com/icons/100/a_icon.gif',
    members: {
      fetch: async (options: unknown) => {
        memberLoads++;
        assert.deepEqual(options, { user: '200', force: true });
        return member;
      },
    },
  } as unknown as Guild;
  const resolveAccess = createWebSessionAccessResolver({
    loadGuild: async id => {
      loads++;
      assert.equal(id, '100');
      return guild;
    },
    discoverChannels: async () => channels,
    save: async value => {
      saved = value;
      return true;
    },
  });
  assert.deepEqual(session.channels, []);
  const [first, second] = await Promise.all([
    resolveAccess(session),
    resolveAccess(session),
  ]);
  assert.equal(first, second);
  assert.equal(loads, 1);
  assert.equal(memberLoads, 1);
  assert.deepEqual(
    first?.channels.map(channel => channel.id),
    ['300']
  );
  assert.equal(first?.displayName, 'current name');
  assert.ok(saved?.accessResolvedAt);
  assert.equal(await resolveAccess(saved!), saved);
  assert.equal(loads, 1);

  // Direct API calls also pass through web access resolution and scoped checks.
  const server = createWebServer({
    origin: 'http://localhost',
    assets: '.',
    findSession: async token =>
      token === 'issuer' ? resolveAccess(saved ?? session) : null,
    search: async (_scope, options) => {
      searches++;
      return {
        messages: [],
        total: 0,
        page: options.page,
        hasMore: false,
        source: 'mongodb',
      };
    },
    getSettings: async () => ({
      enableFeatureIconImageResize: false,
      enableCommandQuestionForEveryone: false,
    }),
    saveSettings: async () => {},
    onError: error => {
      throw error;
    },
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => {
    server.closeAllConnections();
    server.close();
  });
  const address = server.address();
  assert(address && typeof address !== 'string');
  const request = (path: string) =>
    fetch(`http://127.0.0.1:${address.port}${path}`, {
      headers: { Cookie: 'itv_session=issuer' },
    });
  assert.equal(
    (await request('/api/search?channelId=999&allChannels=true')).status,
    403
  );
  assert.equal((await request('/api/settings')).status, 403);
  assert.equal(searches, 0);
  assert.equal((await request('/api/search')).status, 200);
  assert.equal(searches, 1);
});

test('web access fails closed on missing membership, Discord failure or expired/revoked sessions', async () => {
  let attempts = 0;
  const resolveAccess = createWebSessionAccessResolver({
    loadGuild: async () => {
      attempts++;
      throw Object.assign(new Error('unavailable'), {
        status: attempts === 1 ? 404 : 503,
      });
    },
    discoverChannels: async () => [],
    save: async () => {
      throw new Error('must not save');
    },
  });
  assert.equal(await resolveAccess(pendingSession()), null);
  await assert.rejects(resolveAccess(pendingSession()), /unavailable/);
  assert.equal(attempts, 2, 'failed lookup must release the in-flight request');
  const guild = {
    name: 'guild',
    iconURL: () => null,
    members: {
      fetch: async () => ({
        displayName: 'reader',
        displayAvatarURL: () => '',
        permissions: new PermissionsBitField(readable),
      }),
    },
  } as unknown as Guild;
  for (const expiresAt of [new Date(0), new Date(Date.now() + 60000)]) {
    const resolveRevoked = createWebSessionAccessResolver({
      loadGuild: async () => guild,
      discoverChannels: async () => [],
      save: async () => false,
    });
    assert.equal(
      await resolveRevoked({
        ...pendingSession(),
        initialChannelId: undefined,
        expiresAt,
      }),
      null
    );
  }
});

test('REST-only web runtime resolves real Discord overwrites and active threads without gateway login', async t => {
  const guildId = '100000000000000001';
  const userId = '200000000000000001';
  const channelId = '300000000000000001';
  const hiddenId = '300000000000000002';
  const threadId = '300000000000000003';
  const requests: string[] = [];
  t.mock.method(Client.prototype, 'login', () => {
    throw new Error('Web must not log in to the gateway');
  });
  t.mock.method(REST.prototype, 'get', async (route: string) => {
    requests.push(route);
    if (route === Routes.user('@me'))
      return {
        id: '400000000000000001',
        username: 'bot',
        discriminator: '0',
        avatar: null,
        bot: true,
      };
    if (route === `/guilds/${guildId}`)
      return {
        id: guildId,
        name: 'guild',
        owner_id: '500000000000000001',
        icon: 'a_icon',
        roles: [
          { id: guildId, name: '@everyone', permissions: readable.toString() },
        ],
      };
    if (route === `/guilds/${guildId}/members/${userId}`)
      return {
        user: {
          id: userId,
          username: 'reader',
          discriminator: '0',
          avatar: null,
        },
        roles: [],
        nick: 'current nick',
      };
    if (route === `/guilds/${guildId}/channels`)
      return [channelId, hiddenId].map(id => ({
        id,
        guild_id: guildId,
        name: id,
        type: 0,
        position: 0,
        permission_overwrites:
          id === hiddenId
            ? [
                {
                  id: guildId,
                  type: 0,
                  allow: '0',
                  deny: PermissionFlagsBits.ViewChannel.toString(),
                },
              ]
            : [],
      }));
    if (route === `/guilds/${guildId}/threads/active`)
      return {
        threads: [
          {
            id: threadId,
            guild_id: guildId,
            parent_id: channelId,
            name: 'thread',
            type: 11,
            owner_id: userId,
            thread_metadata: {
              archived: false,
              archive_timestamp: new Date().toISOString(),
              auto_archive_duration: 60,
              locked: false,
            },
          },
        ],
        members: [
          { id: threadId, join_timestamp: new Date().toISOString(), flags: 0 },
        ],
      };
    throw new Error(`Unexpected REST route: ${route}`);
  });
  t.mock.method(MessageModel, 'distinct', () => ({
    maxTimeMS: async () => [channelId, threadId],
  }));
  let persisted: WebSession | undefined;
  t.mock.method(
    WebSessionModel,
    'updateOne',
    (filter: Record<string, unknown>, update: { $set: WebSession }) => {
      assert.equal(filter._id, 'session');
      persisted = update.$set;
      return { maxTimeMS: async () => ({ matchedCount: 1 }) };
    }
  );
  const result = await resolveWebSessionAccess({
    ...pendingSession(),
    guildId,
    userId,
    initialChannelId: channelId,
  });
  assert.deepEqual(result?.channels.map(channel => channel.id).sort(), [
    channelId,
    threadId,
  ]);
  assert.equal(result?.displayName, 'current nick');
  assert.ok(persisted?.accessResolvedAt);
  assert.match(result?.guildIconUrl ?? '', /a_icon/);
  assert.equal(requests.length, 5);
});
