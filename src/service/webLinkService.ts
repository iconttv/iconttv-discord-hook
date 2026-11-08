import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChatInputCommandInteraction,
  MessageFlags,
  escapeMarkdown,
} from 'discord.js';
import { config } from '../config';
import logger from '../lib/logger';
import { truncateText } from '../utils';
import { getMessageLink } from '../utils/message';
import { WebHealthProbe } from '../web/health';
import { searchWebMessages } from './webSearchService';
import { createWebSession, getWebConfiguration } from './webSessionService';
import {
  discoverWebChannels,
  selectReadableWebChannels,
} from './webChannelService';

const health = new WebHealthProbe(config.WEB_PUBLIC_URL);
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
    await guild.roles.fetch();
    const member = await guild.members.fetch({
      user: interaction.user.id,
      force: true,
    });
    // The active endpoint describes the bot's access, not the invoking user's.
    // Recalculate member permissions (and private membership) for each result.
    const candidates = await services.discoverChannels(guild);
    const current = interaction.channel;
    const channels = await selectReadableWebChannels(candidates, member);
    if (
      current?.isThread() &&
      !channels.some(channel => channel.id === current.id)
    ) {
      channels.push(...(await selectReadableWebChannels([current], member)));
    }
    if (
      options.inChannel &&
      !channels.some(channel => channel.id === interaction.channelId)
    ) {
      await interaction.editReply(
        '현재 채널의 메시지 기록을 읽을 권한이 없습니다.'
      );
      return;
    }
    if (!webAvailable) {
      const keyword = options.keyword ?? '';
      const channelId = options.inChannel ? interaction.channelId : undefined;
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
    const { origin } = getWebConfiguration();
    const { token, expiresAt } = await services.createSession({
      userId: member.id,
      displayName: member.displayName,
      avatarUrl: member.displayAvatarURL({ size: 128 }),
      guildId: guild.id,
      guildName: guild.name,
      guildIconUrl: guild.iconURL({ size: 128 }) ?? '',
      channels,
      permissions: member.permissions.bitfield.toString(),
    });
    const url = new URL('/search', origin);
    url.searchParams.set('token', token);
    if (options.keyword) url.searchParams.set('keyword', options.keyword);
    if (options.inChannel)
      url.searchParams.set('channelId', interaction.channelId);
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
