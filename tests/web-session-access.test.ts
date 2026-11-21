import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  ChannelType,
  Client,
  PermissionFlagsBits,
  PermissionsBitField,
  type Guild,
  type GuildBasedChannel,
} from 'discord.js';
import {
  createWebSessionAccessPreparer,
  prepareWebSessionAccess,
} from '../src/service/webSessionAccessService';
import MessageModel from '../src/database/model/MessageModel';
import WebSessionModel from '../src/database/model/WebSessionModel';
import type { WebSession } from '../src/web/types';
import { config } from '../src/config';
import { signSessionToken } from '../src/web/sessionToken';

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

const channel = (id: string, permissions = readable) => ({
  id,
  guildId: '100',
  name: id,
  parent: null,
  isTextBased: () => true,
  isThread: () => false,
  permissionsFor: () => new PermissionsBitField(permissions),
}) as unknown as GuildBasedChannel;

const fixture = (cachedRoles = true) => {
  let roleLoads = 0;
  let memberLoads = 0;
  const member = {
    id: '200',
    displayName: 'current name',
    displayAvatarURL: () => '',
    permissions: new PermissionsBitField(readable),
  };
  const guild = {
    id: '100',
    name: 'current guild',
    iconURL: () => 'https://cdn.discordapp.com/icons/100/a_icon.gif',
    roles: {
      cache: new Map(cachedRoles ? [['100', {}]] : []),
      fetch: async () => { roleLoads++; },
    },
    members: {
      fetch: async (options: unknown) => {
        memberLoads++;
        assert.deepEqual(options, { user: '200', force: true });
        return member;
      },
    },
    channels: { fetch: async (...args: unknown[]) => {
      assert.deepEqual(args, ['300'], 'initial supplementation must use the SDK cache');
      return channel('300');
    } },
  } as unknown as Guild;
  return { guild, member, roleLoads: () => roleLoads, memberLoads: () => memberLoads };
};

test('current channel becomes usable before full discovery, after fresh roles and membership', async () => {
  const f = fixture(false);
  const discovery = Promise.withResolvers<GuildBasedChannel[]>();
  const roles = Promise.withResolvers<void>();
  const memberLoaded = Promise.withResolvers<void>();
  const started = Promise.withResolvers<void>();
  f.guild.roles.fetch = (() => roles.promise) as typeof f.guild.roles.fetch;
  f.guild.members.fetch = (async () => {
    memberLoaded.resolve();
    return f.member;
  }) as typeof f.guild.members.fetch;
  let persisted = pendingSession();
  const prepare = createWebSessionAccessPreparer({
    findSession: async () => persisted,
    discoverChannels: async () => {
      started.resolve();
      return discovery.promise;
    },
    save: async value => { persisted = value; return true; },
    markFailed: async () => { assert.fail('must not mark successful access failed'); },
  });
  const first = prepare(f.guild, 'issuer');
  assert.equal(prepare(f.guild, 'issuer'), first);
  await memberLoaded.promise;
  assert.equal(persisted.accessPartialAt, undefined);
  assert.deepEqual(persisted.channels, [], 'roles must finish before publishing access');
  roles.resolve();
  await started.promise;
  assert.ok(persisted.accessPartialAt);
  assert.equal(persisted.accessResolvedAt, undefined);
  assert.deepEqual(persisted.channels.map(value => value.id), ['300']);
  assert.equal(persisted.displayName, 'current name');
  assert.equal(persisted.permissions, readable.toString());
  discovery.resolve([channel('301'), channel('999', 0n)]);
  await first;
  assert.deepEqual(persisted.channels.map(value => value.id), ['300', '301']);
  assert.ok(persisted.accessResolvedAt);
  const ready = persisted;
  await prepare(f.guild, 'issuer');
  assert.equal(persisted, ready);
});

test('warm role cache preserves channel permissions and private-thread membership checks without mutating discovery', async () => {
  const f = fixture();
  const privateThread = (id: string, joined: boolean) => ({
    ...channel(id),
    type: ChannelType.PrivateThread,
    isThread: () => true,
    members: { fetch: async (options: unknown) => {
      assert.deepEqual(options, { member: '200', force: true });
      if (!joined) throw Object.assign(new Error('not joined'), { status: 404 });
      return { id: '200' };
    } },
  }) as unknown as GuildBasedChannel;
  const candidates = Object.freeze([
    channel('999', 0n), privateThread('301', true), privateThread('302', false),
  ]) as unknown as GuildBasedChannel[];
  let saved: WebSession | undefined;
  const prepare = createWebSessionAccessPreparer({
    findSession: async () => pendingSession(),
    discoverChannels: async () => candidates,
    save: async value => { saved = value; return true; },
    markFailed: async () => { assert.fail('must not fail'); },
  });
  await prepare(f.guild, 'issuer');
  assert.deepEqual(candidates.map(value => value.id), ['999', '301', '302']);
  assert.deepEqual(saved?.channels.map(value => value.id).sort(), ['300', '301']);
  assert.equal(f.roleLoads(), 0, 'gateway-cached roles must not be refreshed');
  assert.equal(f.memberLoads(), 1, 'cached roles do not make cached members authoritative');
});

test('an unjoined private initial thread never publishes partial access', async () => {
  const f = fixture();
  const discovery = Promise.withResolvers<GuildBasedChannel[]>();
  const started = Promise.withResolvers<void>();
  f.guild.channels.fetch = (async () => ({
    ...channel('300'),
    type: ChannelType.PrivateThread,
    isThread: () => true,
    members: { fetch: async () => null },
  })) as typeof f.guild.channels.fetch;
  let persisted = pendingSession();
  const prepare = createWebSessionAccessPreparer({
    findSession: async () => persisted,
    discoverChannels: async () => { started.resolve(); return discovery.promise; },
    save: async value => { persisted = value; return true; },
    markFailed: async () => { assert.fail('must not fail'); },
  });
  const job = prepare(f.guild, 'issuer');
  await started.promise;
  assert.equal(persisted.accessPartialAt, undefined);
  assert.deepEqual(persisted.channels, []);
  discovery.resolve([channel('301')]);
  await job;
  assert.ok(persisted.accessResolvedAt);
  assert.deepEqual(persisted.channels.map(value => value.id), ['301']);
});

test('preparation failures never expose unchecked channels and preserve verified partial access', async () => {
  for (const cause of ['member', 'roles', 'discovery', 'guild', 'save', 'unmatched', 'finalSave']) {
    const f = fixture();
    const session = pendingSession();
    const failure = new Error(cause);
    if (cause === 'member') f.guild.members.fetch = (async () => { throw failure; }) as typeof f.guild.members.fetch;
    if (cause === 'roles') {
      f.guild.roles.cache.clear();
      f.guild.roles.fetch = (async () => { throw failure; }) as typeof f.guild.roles.fetch;
    }
    if (cause === 'guild') session.guildId = 'different';
    let persisted = session;
    let failed: WebSession | undefined;
    const prepare = createWebSessionAccessPreparer({
      findSession: async () => session,
      discoverChannels: async () => {
        if (cause === 'discovery') throw failure;
        return [channel('301')];
      },
      save: async value => {
        if (cause === 'save' || (cause === 'finalSave' && value.accessResolvedAt)) throw failure;
        if (cause === 'unmatched') return false;
        persisted = value;
        return true;
      },
      markFailed: async value => { failed = value; },
    });
    await assert.rejects(prepare(f.guild, 'issuer'));
    assert.ok(failed, cause);
    assert.equal(persisted.accessResolvedAt, undefined, cause);
    if (cause === 'discovery' || cause === 'finalSave') {
      assert.ok(failed.accessPartialAt, cause);
      assert.deepEqual(failed.channels.map(value => value.id), ['300']);
      assert.deepEqual(persisted.channels, failed.channels);
    } else {
      assert.equal(failed.accessPartialAt, undefined, cause);
      assert.deepEqual(persisted.channels, []);
    }
  }
});

test('missing, expired, failed and ready sessions never initialize or overwrite access', async () => {
  const f = fixture();
  for (const session of [
    null,
    { ...pendingSession(), expiresAt: new Date(0) },
    { ...pendingSession(), accessResolvedAt: new Date() },
    { ...pendingSession(), accessFailedAt: new Date() },
    { ...pendingSession(), channelsFailedAt: new Date() },
  ]) {
    const forbidden = async () => { assert.fail('terminal session must not be changed'); };
    const prepare = createWebSessionAccessPreparer({
      findSession: async () => session,
      discoverChannels: forbidden,
      save: forbidden,
      markFailed: forbidden,
    });
    await prepare(f.guild, 'issuer');
  }
  assert.equal(f.roleLoads(), 0);
  const session = pendingSession();
  const prepare = createWebSessionAccessPreparer({
    findSession: async () => session,
    discoverChannels: async () => {
      session.expiresAt = new Date(0);
      return [channel('300')];
    },
    save: async value => {
      assert.ok(value.accessPartialAt);
      assert.equal(value.accessResolvedAt, undefined, 'expired discovery must not publish full access');
      return true;
    },
    markFailed: async () => { assert.fail('expired session need not be changed'); },
  });
  await prepare(f.guild, 'issuer');
});

test('bot uses gateway-style SDK caches but refreshes stale member roles and individually loads missing archives', async t => {
  const original = { ...config };
  t.after(() => Object.assign(config, original));
  Object.assign(config, {
    WEB_PUBLIC_URL: 'https://web.example',
    WEB_SESSION_SECRET: 'test-only-secret-012345678901234567890123',
    WEB_SESSION_TTL_SECONDS: '1800',
  });
  const guildId = '100000000000000001';
  const userId = '200000000000000001';
  const channelId = '300000000000000001';
  const hiddenId = '300000000000000002';
  const threadId = '300000000000000003';
  const archivedId = '300000000000000004';
  const readerRoleId = '400000000000000001';
  const requests: string[] = [];
  const client = new Client({ intents: [] });
  let memberFailure = false;
  let memberCanRead = true;
  let discoveryFailure = false;
  t.mock.method(client.rest, 'get', async (route: string) => {
    requests.push(route);
    const roles = [
      { id: guildId, name: '@everyone', permissions: '0' },
      { id: readerRoleId, name: 'reader', permissions: readable.toString() },
    ];
    const member = (canRead: boolean) => ({
      user: { id: userId, username: 'reader', discriminator: '0', avatar: null },
      roles: canRead ? [readerRoleId] : [], nick: 'current nick',
    });
    const thread = (id: string) => ({
      id, guild_id: guildId, parent_id: channelId, name: id,
      type: ChannelType.PublicThread, owner_id: userId,
      thread_metadata: {
        archived: id === archivedId, archive_timestamp: new Date().toISOString(),
        auto_archive_duration: 60, locked: false,
      },
    });
    if (route === `/guilds/${guildId}`)
      // The SDK hydrates these exactly as gateway GUILD_CREATE data. Guilds
      // maintains roles/channels, but no GuildMembers intent keeps members fresh.
      return {
        id: guildId, name: 'guild', owner_id: '500000000000000001', icon: null,
        roles, members: [member(true)], threads: [thread(threadId)],
        channels: [channelId, hiddenId].map(id => ({
          id, guild_id: guildId, name: id, type: ChannelType.GuildText, position: 0,
          permission_overwrites: id === hiddenId
            ? [{ id: guildId, type: 0, allow: '0', deny: PermissionFlagsBits.ViewChannel.toString() }] : [],
        })),
      };
    if (route === `/guilds/${guildId}/members/${userId}`) {
      if (memberFailure) throw Object.assign(new Error('missing member'), { status: 404 });
      return member(memberCanRead);
    }
    if (route === `/channels/${archivedId}`) return thread(archivedId);
    throw new Error(`Unexpected bot REST route: ${route}`);
  });
  const guild = await client.guilds.fetch(guildId);
  assert.equal(guild.client, client);
  assert.ok(guild.roles.cache.has(guildId));
  assert.ok(guild.channels.cache.has(channelId));
  assert.ok(guild.channels.cache.has(threadId));
  assert.equal(guild.channels.cache.has(archivedId), false);
  assert.ok(guild.members.cache.get(userId)?.permissions.has(readable));
  t.mock.method(MessageModel, 'distinct', () => ({
    maxTimeMS: async () => {
      if (discoveryFailure) throw new Error('archive discovery unavailable');
      return [channelId, threadId, archivedId];
    },
  }));
  const session = {
    ...pendingSession(), id: '11111111-1111-4111-8111-111111111111',
    guildId, userId, initialChannelId: channelId,
    expiresAt: new Date(Math.floor(Date.now() / 1000) * 1000 + 60000),
  };
  let persisted: Partial<WebSession> | undefined;
  let matched = 1;
  const writes: { filter: Record<string, unknown>; scope: Partial<WebSession> }[] = [];
  t.mock.method(WebSessionModel, 'findOne', () => ({
    lean: async () => ({ ...session, _id: session.id }),
  }));
  t.mock.method(WebSessionModel, 'updateOne', (filter: Record<string, unknown>, update: { $set: Partial<WebSession> }) => {
    writes.push({ filter, scope: update.$set });
    return { maxTimeMS: async () => {
      if (matched) persisted = update.$set;
      return { matchedCount: matched };
    } };
  });
  const token = signSessionToken(session.id, session.expiresAt, config.WEB_SESSION_SECRET!);
  await prepareWebSessionAccess(guild, token);
  assert.ok(persisted?.channels);
  assert.deepEqual(persisted.channels.map(value => value.id).sort(), [channelId, threadId, archivedId]);
  assert.equal(persisted?.displayName, 'current nick');
  assert.equal(persisted?.permissions, readable.toString());
  assert.ok(persisted?.accessResolvedAt);
  assert.equal(requests.includes(`/guilds/${guildId}/roles`), false);
  assert.equal(requests.includes(`/guilds/${guildId}/channels`), false);
  assert.equal(requests.includes(`/guilds/${guildId}/threads/active`), false);
  assert.ok(requests.includes(`/channels/${archivedId}`));
  const expirationFilter = writes[0].filter.expiresAt;
  assert.ok(expirationFilter && typeof expirationFilter === 'object');
  assert.ok('$gt' in expirationFilter && expirationFilter.$gt instanceof Date);
  assert.deepEqual(writes[0].filter, {
    _id: session.id, userId, guildId,
    expiresAt: { $eq: session.expiresAt, $gt: expirationFilter.$gt },
    accessResolvedAt: { $exists: false }, accessFailedAt: { $exists: false },
    channelsFailedAt: { $exists: false },
  });
  memberCanRead = false;
  assert.ok(guild.members.cache.get(userId)?.permissions.has(readable), 'cached member still has the removed role');
  await prepareWebSessionAccess(guild, token);
  assert.deepEqual(persisted?.channels, [], 'fresh role removal must deny access despite warm channel and role caches');
  assert.equal(persisted?.permissions, '0');
  assert.equal(requests.filter(route => route === `/guilds/${guildId}/members/${userId}`).length, 2);
  assert.equal(requests.filter(route => route === `/channels/${archivedId}`).length, 1);
  assert.equal(requests.includes(`/guilds/${guildId}/roles`), false);
  assert.equal(requests.includes(`/guilds/${guildId}/channels`), false);
  assert.equal(requests.includes(`/guilds/${guildId}/threads/active`), false);
  memberFailure = true;
  await assert.rejects(prepareWebSessionAccess(guild, token), /missing member/);
  assert.ok(persisted?.accessFailedAt);
  assert.deepEqual(persisted?.channels, []);
  assert.equal(persisted?.permissions, '0');
  assert.equal(persisted?.accessResolvedAt, undefined);
  assert.deepEqual(writes.at(-1)?.filter.accessResolvedAt, { $exists: false });
  assert.deepEqual(writes.at(-1)?.filter.accessFailedAt, { $exists: false });
  memberFailure = false;
  memberCanRead = true;
  discoveryFailure = true;
  await assert.rejects(prepareWebSessionAccess(guild, token), /archive discovery unavailable/);
  assert.ok(persisted?.channelsFailedAt);
  assert.equal(persisted?.accessFailedAt, undefined);
  assert.deepEqual(writes.at(-1)?.scope, { channelsFailedAt: persisted?.channelsFailedAt });
  assert.deepEqual(writes.at(-2)?.scope.channels?.map(value => value.id), [channelId]);
  discoveryFailure = false;
  memberFailure = false;
  matched = 0;
  const previous = persisted;
  await assert.rejects(prepareWebSessionAccess(guild, token), /could not be persisted/);
  assert.equal(persisted, previous, 'revoked, expired or concurrently ready sessions must not be overwritten');
  assert.ok(writes.at(-1)?.scope.accessFailedAt);
});
