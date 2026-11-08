import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  ChatInputCommandInteraction,
  GuildBasedChannel,
  MessageFlags,
  PermissionsBitField,
  PermissionFlagsBits,
} from 'discord.js';
import { config } from '../src/config';
import { replyWithWebLink } from '../src/service/webLinkService';
import type { WebSearchOptions, WebSearchScope } from '../src/web/types';

const fixture = (available: boolean) => {
  const replies: unknown[] = [];
  const searches: { scope: WebSearchScope; options: WebSearchOptions }[] = [];
  const sessions: unknown[] = [];
  let permissionFetches = 0;
  const member = {
    id: '200',
    displayName: 'reader',
    displayAvatarURL: () => '',
    permissions: new PermissionsBitField(0n),
  };
  const channels = ['300', '301', '999'].map(id => ({
    id,
    name: id,
    parent: null,
    isTextBased: () => true,
    isThread: () => false,
    permissionsFor: () =>
      new PermissionsBitField(
        id === '999'
          ? 0n
          : PermissionFlagsBits.ViewChannel |
            PermissionFlagsBits.ReadMessageHistory
      ),
  })) as unknown as GuildBasedChannel[];
  const interaction = {
    guild: {
      id: '100',
      name: 'guild',
      iconURL: () => null,
      roles: {
        fetch: async () => {
          permissionFetches++;
        },
      },
      members: { fetch: async () => member },
    },
    channel: channels[0],
    channelId: '300',
    memberPermissions: new PermissionsBitField([
      PermissionFlagsBits.ViewChannel,
      PermissionFlagsBits.ReadMessageHistory,
    ]),
    user: { id: member.id, username: 'reader', displayAvatarURL: () => '' },
    deferReply: async (options: { flags: number }) => {
      assert.equal(options.flags, MessageFlags.Ephemeral);
    },
    editReply: async (reply: unknown) => {
      replies.push(reply);
    },
  } as unknown as ChatInputCommandInteraction;
  const services = {
    isHealthy: async () => available,
    discoverChannels: async () => channels,
    createSession: async (input: unknown) => {
      sessions.push(input);
      return { token: 'test-token', expiresAt: new Date(Date.now() + 60000) };
    },
    search: async (scope: WebSearchScope, options: WebSearchOptions) => {
      searches.push({ scope, options });
      return {
        messages: ['300', '301', '999'].map(channelId => ({
          id: '400',
          channelId,
          channelName: channelId,
          senderName: 'user',
          senderId: '200',
          timestamp: '2026-11-08T00:00:00Z',
          content:
            channelId === '999' ? 'private-secret' : '@everyone search result',
          link: `https://discord.com/channels/100/${channelId}/400`,
        })),
        page: 1,
        hasMore: false,
        total: 3,
        source: 'elasticsearch' as const,
      };
    },
  };
  return {
    interaction,
    services,
    replies,
    searches,
    sessions,
    permissionFetches: () => permissionFetches,
  };
};

test('/itvweb unavailable returns only the requested notice without tokens or permission work', async () => {
  const f = fixture(false);
  await replyWithWebLink(f.interaction, {}, f.services);
  assert.deepEqual(f.replies, ['현재 웹페이지를 사용할 수 없습니다.']);
  assert.equal(f.permissionFetches(), 0);
  assert.equal(f.sessions.length, 0);
  assert.equal(f.searches.length, 0);
});

test('/itvsc unavailable searches in process without web credentials and keeps channel permissions', async () => {
  const original = config.WEB_SESSION_SECRET;
  config.WEB_SESSION_SECRET = undefined;
  try {
    const f = fixture(false);
    await replyWithWebLink(
      f.interaction,
      {
        keyword: 'test',
        inChannel: true,
        semantic: true,
        fallbackToMessages: true,
      },
      f.services
    );
    assert.equal(f.sessions.length, 0);
    assert.deepEqual(
      f.searches[0].scope.channels.map(channel => channel.id),
      ['300']
    );
    assert.equal(f.searches[0].options.channelId, '300');
    assert.equal(f.searches[0].options.mode, 'semantic');
    assert.equal(f.permissionFetches(), 0);
    const reply = f.replies[0] as {
      content: string;
      components: unknown[];
      allowedMentions: unknown;
    };
    assert.match(reply.content, /discord.com\/channels\/100\/300\/400/);
    assert.doesNotMatch(reply.content, /private-secret|\/301\/|token=/);
    assert.deepEqual(reply.components, []);
    assert.deepEqual(reply.allowedMentions, { parse: [] });
    const all = fixture(false);
    await replyWithWebLink(
      all.interaction,
      { fallbackToMessages: true, inChannel: false },
      all.services
    );
    assert.equal(all.searches[0].options.keyword, '');
    assert.equal(all.searches[0].options.sort, 'newest');
    assert.equal(all.searches[0].options.channelId, undefined);
    assert.match((all.replies[0] as { content: string }).content, /\/301\//);
  } finally {
    config.WEB_SESSION_SECRET = original;
  }
});

test('healthy commands save only identity and issue a current-channel link without any permission discovery', async () => {
  const original = { ...config };
  Object.assign(config, {
    WEB_PUBLIC_URL: 'https://web.example',
    WEB_SESSION_SECRET: 'test-only-secret-012345678901234567890123',
    WEB_SESSION_TTL_SECONDS: '1800',
  });
  try {
    for (const options of [
      {},
      { keyword: 'test', inChannel: true, fallbackToMessages: true },
      { keyword: 'test', inChannel: false, fallbackToMessages: true },
    ]) {
      const f = fixture(true);
      const forbidden = async () => {
        throw new Error('Link issuance must not request Discord permissions');
      };
      Object.assign(f.interaction.guild!.roles, { fetch: forbidden });
      Object.assign(f.interaction.guild!.members, { fetch: forbidden });
      f.services.discoverChannels = forbidden;
      await replyWithWebLink(f.interaction, options, f.services);
      assert.equal(f.sessions.length, 1);
      assert.equal(f.searches.length, 0);
      const reply = f.replies[0] as {
        components: { toJSON(): { components: { url: string }[] } }[];
      };
      const url = new URL(reply.components[0].toJSON().components[0].url);
      assert.equal(url.origin, 'https://web.example');
      assert.equal(url.searchParams.get('token'), 'test-token');
      assert.equal(
        url.searchParams.get('channelId'),
        options.inChannel === false ? null : '300'
      );
      assert.equal(
        url.searchParams.get('allChannels'),
        String(options.inChannel === false)
      );
      const session = f.sessions[0] as {
        channels: unknown[];
        permissions: string;
        initialChannelId: string;
        accessResolvedAt?: Date;
      };
      assert.deepEqual(session.channels, []);
      assert.equal(session.permissions, '0');
      assert.equal(session.initialChannelId, '300');
      assert.equal(session.accessResolvedAt, undefined);
    }
  } finally {
    Object.assign(config, original);
  }
});

test('unreadable current channel cannot reach fallback search or token creation', async () => {
  const f = fixture(false);
  Object.assign(f.interaction, {
    channelId: '999',
    memberPermissions: new PermissionsBitField(0n),
  });
  await replyWithWebLink(
    f.interaction,
    { inChannel: true, fallbackToMessages: true },
    f.services
  );
  assert.deepEqual(f.replies, [
    '현재 채널의 메시지 기록을 읽을 권한이 없습니다.',
  ]);
  assert.equal(f.sessions.length, 0);
  assert.equal(f.searches.length, 0);
});
