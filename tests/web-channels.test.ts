import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  ChannelType,
  Client,
  GatewayIntentBits,
  Guild,
  GuildMember,
  PermissionsBitField,
  PermissionFlagsBits,
} from 'discord.js';
import type { GuildBasedChannel } from 'discord.js';
import {
  selectReadableWebChannels,
  discoverWebChannels,
} from '../src/service/webChannelService';
import MessageModel from '../src/database/model/MessageModel';

test('channel discovery uses SDK channels and refreshes archive IDs without custom caches', async t => {
  let archiveQueries = 0;
  const fetches: string[] = [];
  let deleted = false;
  let storedIds: unknown[] = ['300', '301', '302', 'invalid', null];
  const channel = {
    id: '300',
    guildId: '100',
  } as GuildBasedChannel;
  const live = { id: '302', guildId: '100' } as GuildBasedChannel;
  const cache = new Map<string, GuildBasedChannel>([['302', live]]);
  const guild = {
    id: '100',
    channels: {
      cache,
      fetch: async (id?: string, options?: unknown) => {
        assert.ok(id, 'discovery must never fetch the full channel list');
        assert.equal(options, undefined, 'individual fetches must use SDK caching');
        fetches.push(id);
        if (id === '301' || deleted) throw new Error('deleted');
        cache.set(id, channel);
        return channel;
      },
      fetchActiveThreads: async () => {
        assert.fail('discovery must never fetch active threads');
      },
    },
  } as unknown as Guild;
  t.mock.method(MessageModel, 'distinct', () => {
    archiveQueries++;
    return {
      maxTimeMS: async () => storedIds,
    };
  });
  assert.deepEqual(
    (await discoverWebChannels(guild)).map(item => item.id),
    ['302', '300']
  );
  assert.deepEqual(fetches, ['300', '301']);
  assert.equal(archiveQueries, 1);
  await discoverWebChannels(guild);
  // Successful objects live only in the SDK; failed lookups are not TTL-cached.
  assert.deepEqual(fetches, ['300', '301', '301']);
  assert.equal(archiveQueries, 2);
  deleted = true;
  cache.delete('300');
  assert.deepEqual(await discoverWebChannels(guild), [live]);
  assert.deepEqual(fetches, ['300', '301', '301', '300', '301']);
  cache.set('301', { id: '301', guildId: '100' } as GuildBasedChannel);
  // Each job queries Mongo again, so new archived channel IDs appear immediately.
  storedIds = ['301', '302', '303'];
  cache.set('303', { id: '303', guildId: '100' } as GuildBasedChannel);
  assert.deepEqual(
    (await discoverWebChannels(guild)).map(item => item.id),
    ['302', '301', '303']
  );
  assert.equal(archiveQueries, 4);
  assert.deepEqual(fetches, ['300', '301', '301', '300', '301']);
});

test('archive channel resolution bounds concurrent missing lookups to five', async t => {
  const ids = Array.from({ length: 12 }, (_, index) => String(300 + index));
  t.mock.method(MessageModel, 'distinct', () => ({
    maxTimeMS: async () => ids,
  }));
  let inFlight = 0;
  let maximum = 0;
  const cache = new Map<string, GuildBasedChannel>();
  const guild = {
    id: '100',
    channels: {
      cache,
      fetch: async (id: string) => {
        inFlight++;
        maximum = Math.max(maximum, inFlight);
        await Promise.resolve();
        inFlight--;
        const channel = { id, guildId: '100' } as GuildBasedChannel;
        cache.set(id, channel);
        return channel;
      },
    },
  } as unknown as Guild;
  assert.equal((await discoverWebChannels(guild)).length, ids.length);
  assert.equal(maximum, 5);
});

test('SDK gateway channel and role changes remain authoritative without REST requests', async t => {
  const client = new Client({ intents: [GatewayIntentBits.Guilds] });
  const rest = t.mock.method(client.rest, 'get', async () => {
    assert.fail('cached discovery must not make REST requests');
  });
  const guild = new Guild(client, {
    id: '100000000000000001',
    name: 'Test',
    owner_id: '999999999999999999',
    roles: [{
      id: '100000000000000001',
      name: '@everyone',
      permissions: (
        PermissionFlagsBits.ViewChannel | PermissionFlagsBits.ReadMessageHistory
      ).toString(),
      position: 0,
    }],
    channels: [],
  });
  const member = new GuildMember(client, {
    user: {
      id: '200000000000000001',
      username: 'reader',
      discriminator: '0',
      avatar: null,
    },
    roles: [],
  }, guild);
  const payload = {
    id: '300000000000000001',
    name: 'live',
    type: ChannelType.GuildText,
    guild_id: guild.id,
    position: 0,
    permission_overwrites: [] as {
      id: string; type: number; allow: string; deny: string;
    }[],
  };
  // These SDK insertion/update paths are also used by gateway handlers.
  client.channels._add(payload, guild);
  t.mock.method(MessageModel, 'distinct', () => ({ maxTimeMS: async () => [] }));
  const readable = async () =>
    selectReadableWebChannels(await discoverWebChannels(guild), member);
  assert.equal((await readable()).length, 1);
  client.channels._add({
    ...payload,
    permission_overwrites: [{
      id: guild.id,
      type: 0,
      allow: '0',
      deny: PermissionFlagsBits.ViewChannel.toString(),
    }],
  }, guild);
  assert.deepEqual(await readable(), []);
  client.channels._add(payload, guild);
  assert.equal((await readable()).length, 1);
  guild.roles.cache.get(guild.id)!.permissions = new PermissionsBitField(0n);
  assert.deepEqual(await readable(), []);
  guild.roles.cache.get(guild.id)!.permissions = new PermissionsBitField([
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.ReadMessageHistory,
  ]);
  assert.equal((await readable()).length, 1);
  assert.equal(
    await guild.channels.fetch(payload.id),
    guild.channels.cache.get(payload.id)
  );
  client.channels._remove(payload.id);
  assert.deepEqual(await discoverWebChannels(guild), []);
  assert.equal(rest.mock.callCount(), 0);
  await client.destroy();
});

// Real discord.js permission resolution: role and member overwrites must be
// applied to the requesting member, not to the bot's much broader permissions.

test('channel snapshots obey role/member overwrites and ReadMessageHistory', async () => {
  const client = new Client({ intents: [GatewayIntentBits.Guilds] });
  const guild = new Guild(client, {
    id: '100000000000000001',
    name: 'Test',
    owner_id: '999999999999999999',
    roles: [
      {
        id: '100000000000000001',
        name: '@everyone',
        permissions: (
          PermissionFlagsBits.ViewChannel |
          PermissionFlagsBits.ReadMessageHistory
        ).toString(),
        position: 0,
      },
      {
        id: '100000000000000002',
        name: 'restricted',
        permissions: '0',
        position: 1,
      },
    ],
    channels: [],
  });
  const member = new GuildMember(
    client,
    {
      user: {
        id: '200000000000000001',
        username: 'reader',
        discriminator: '0',
        avatar: null,
      },
      roles: ['100000000000000002'],
    },
    guild
  );
  guild.members.cache.set(member.id, member);
  const definitions = [
    { id: '300000000000000001', name: 'allowed', permission_overwrites: [] },
    {
      id: '300000000000000002',
      name: 'denied-role',
      permission_overwrites: [
        {
          id: '100000000000000002',
          type: 0,
          allow: '0',
          deny: PermissionFlagsBits.ViewChannel.toString(),
        },
      ],
    },
    {
      id: '300000000000000003',
      name: 'no-history',
      permission_overwrites: [
        {
          id: member.id,
          type: 1,
          allow: '0',
          deny: PermissionFlagsBits.ReadMessageHistory.toString(),
        },
      ],
    },
    {
      id: '300000000000000004',
      name: 'member-allow',
      permission_overwrites: [
        {
          id: '100000000000000002',
          type: 0,
          allow: '0',
          deny: PermissionFlagsBits.ViewChannel.toString(),
        },
        {
          id: member.id,
          type: 1,
          allow: PermissionFlagsBits.ViewChannel.toString(),
          deny: '0',
        },
      ],
    },
  ];
  // _add constructs channels exactly as a gateway payload does, without login.
  const channels = definitions.map(definition =>
    client.channels._add(
      {
        ...definition,
        type: ChannelType.GuildText,
        guild_id: guild.id,
        position: 0,
      },
      guild
    )
  );
  const result = await selectReadableWebChannels(channels, member);
  assert.deepEqual(result.map(channel => channel.name).sort(), [
    'allowed',
    'member-allow',
  ]);
  assert.deepEqual(
    await selectReadableWebChannels(channels, member, '300000000000000002'),
    []
  );
  await client.destroy();
});

test('private thread requires membership or ManageThreads, with parent permissions', async () => {
  const member = { id: 'user' } as GuildMember;
  const permissions = new PermissionsBitField([
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.ReadMessageHistory,
  ]);
  let memberPresent = false;
  const privateThread = {
    id: 'private',
    name: 'Private',
    type: ChannelType.PrivateThread,
    parent: { name: 'Parent', parent: { name: 'Category' } },
    isTextBased: () => true,
    isThread: () => true,
    permissionsFor: () => permissions,
    members: {
      fetch: async () => {
        if (!memberPresent) throw new Error('not a member');
        return { id: member.id };
      },
    },
  } as unknown as GuildBasedChannel;
  assert.deepEqual(
    await selectReadableWebChannels([privateThread], member),
    []
  );
  memberPresent = true;
  assert.equal(
    (await selectReadableWebChannels([privateThread], member))[0].parentName,
    'Parent'
  );
  memberPresent = false;
  permissions.add(PermissionFlagsBits.ManageThreads);
  assert.equal(
    (await selectReadableWebChannels([privateThread], member)).length,
    1
  );
  permissions.remove(PermissionFlagsBits.ViewChannel);
  assert.deepEqual(
    await selectReadableWebChannels([privateThread], member),
    []
  );
});
