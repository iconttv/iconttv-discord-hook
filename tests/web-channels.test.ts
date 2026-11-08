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
import { selectReadableWebChannels } from '../src/service/webChannelService';

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
