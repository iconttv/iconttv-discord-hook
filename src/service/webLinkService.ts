import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChatInputCommandInteraction,
  MessageFlags,
  PermissionFlagsBits,
  GuildMember,
  escapeMarkdown,
} from 'discord.js';
import { config } from '../config';
import type { WebChannel } from '../web/types';
import logger from '../lib/logger';
import { truncateText } from '../utils';
import { getMessageLink } from '../utils/message';
import { WebHealthProbe, getWebHealthOrigin } from '../web/health';
import { searchWebMessages } from './webSearchService';
import { createWebSession, getWebConfiguration } from './webSessionService';
import {
  discoverWebChannels,
  selectReadableWebChannels,
} from './webChannelService';

const health = new WebHealthProbe(
  getWebHealthOrigin(config.WEB_PORT, config.WEB_HEALTH_URL)
);
const defaultServices = {
  isHealthy: () => health.check(),
  discoverChannels: discoverWebChannels,
  createSession: createWebSession,
  search: searchWebMessages,
};

export const replyWithWebLink = async (
  interaction: ChatInputCommandInteraction,
  options: {
    keyword?: string;
    inChannel?: boolean;
    semantic?: boolean;
    fallbackToMessages?: boolean;
  } = {},
  services: typeof defaultServices = defaultServices
) => {
  if (!interaction.guild) {
    await interaction.reply({
      content: '서버에서 사용할 수 있는 기능입니다.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  let webAvailable = false;
  try {
    webAvailable = await services.isHealthy();
    if (!webAvailable && !options.fallbackToMessages) {
      await interaction.editReply('현재 웹페이지를 사용할 수 없습니다.');
      return;
    }
    const guild = interaction.guild;
    const inChannel = options.inChannel ?? true;
    if (webAvailable) {
      // An interaction already identifies its issuer and originating channel.
      // Resolve readable channels and settings privileges on first web access.
      const member =
        interaction.member instanceof GuildMember ? interaction.member : null;
      const { origin } = getWebConfiguration();
      const { token, expiresAt } = await services.createSession({
        userId: interaction.user.id,
        displayName:
          member?.displayName ??
          interaction.user.globalName ??
          interaction.user.username,
        avatarUrl:
          member?.displayAvatarURL({ size: 128 }) ??
          interaction.user.displayAvatarURL({ size: 128 }),
        guildId: guild.id,
        guildName: guild.name,
        guildIconUrl: guild.iconURL({ size: 128 }) ?? '',
        initialChannelId: interaction.channelId,
        channels: [],
        permissions: '0',
      });
      const url = new URL('/search', origin);
      url.searchParams.set('token', token);
      if (options.keyword) url.searchParams.set('keyword', options.keyword);
      if (inChannel) url.searchParams.set('channelId', interaction.channelId);
      url.searchParams.set('allChannels', String(!inChannel));
      url.searchParams.set('embedding', String(options.semantic ?? false));
      await interaction.editReply({
        content: `웹에서 대화를 검색하고 원문으로 이동할 수 있어요.\n이 링크는 <t:${Math.floor(expiresAt.getTime() / 1000)}:R> 만료됩니다.`,
        components: [
          new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
              .setLabel('검색 페이지 열기')
              .setStyle(ButtonStyle.Link)
              .setURL(url.toString())
          ),
        ],
      });
      return;
    }
    let channels: WebChannel[];
    if (inChannel) {
      const current = interaction.channel;
      if (
        !current ||
        !('name' in current) ||
        !interaction.memberPermissions?.has([
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.ReadMessageHistory,
        ])
      ) {
        await interaction.editReply(
          '현재 채널의 메시지 기록을 읽을 권한이 없습니다.'
        );
        return;
      }
      channels = [
        {
          id: current.id,
          name: current.name ?? '',
          category: '',
          parentName: current.isThread() ? current.parent?.name : undefined,
        },
      ];
    } else {
      const [, member, candidates] = await Promise.all([
        guild.roles.fetch(),
        guild.members.fetch({ user: interaction.user.id, force: true }),
        services.discoverChannels(guild),
      ]);
      channels = await selectReadableWebChannels(candidates, member);
    }
    if (!webAvailable) {
      const keyword = options.keyword ?? '';
      const channelId = inChannel ? interaction.channelId : undefined;
      const result = await services.search(
        { guildId: guild.id, channels },
        {
          keyword,
          channelId,
          mode: keyword && options.semantic ? 'semantic' : 'text',
          sort: keyword ? 'relevance' : 'newest',
          page: 1,
        }
      );
      const messages = result.messages
        .filter(
          message =>
            channels.some(channel => channel.id === message.channelId) &&
            (!channelId || message.channelId === channelId)
        )
        .slice(0, options.semantic && keyword ? 8 : 10);
      const lines = messages.map(message => {
        const snippet = escapeMarkdown(
          truncateText(
            (
              message.content ||
              (message.images?.length
                ? '[첨부 이미지]'
                : '[본문이 없는 메시지]')
            )
              .replace(/\s+/g, ' ')
              .trim(),
            30
          )
        );
        const timestamp = new Date(message.timestamp);
        const time = Number.isFinite(timestamp.getTime())
          ? ` (<t:${Math.floor(timestamp.getTime() / 1000)}:f>)`
          : '';
        return `- ${snippet} ${getMessageLink(guild.id, message.channelId, message.id)}${time}`;
      });
      await interaction.editReply({
        content: lines.join('\n') || '검색 결과가 없습니다.',
        components: [],
        allowedMentions: { parse: [] },
      });
      return;
    }
  } catch {
    logger.error(
      webAvailable
        ? 'Web session link creation failed.'
        : 'Discord search fallback failed.'
    );
    await interaction.editReply(
      webAvailable
        ? '검색 페이지 링크를 만들 수 없습니다. 잠시 후 다시 시도해 주세요.'
        : '검색 기능에 에러가 발생했습니다.'
    );
  }
};
