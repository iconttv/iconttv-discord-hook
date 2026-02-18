import {
  EmbedBuilder,
  type Guild,
  type GuildMember,
  Message,
  EmbedAuthorOptions,
  AttachmentBuilder,
  MessageFlags,
  GuildBasedChannel,
  CommandInteraction,
  TopLevelComponent,
  Embed,
  APIEmbed,
  EmbedData,
  Interaction,
} from 'discord.js';
import path from 'path';

import { Icon } from '../../models/index';
import client from '../../lib/discord';
import { getRandomTelecomIP } from '../telecomIP';
import logger from '../../lib/logger';

export interface LogContext {
  senderName: string;
  senderMessage: string;
  senderId: string;
  messageId: string;
  messageType: number;
  attachments: unknown[];
  components: TopLevelComponent[];
  embeds: Embed[];
  guildMember?: GuildMember;
  guildName: string;
  guildId: string;
  channel?: GuildBasedChannel;
  channelName: string;
  channelId: string;
  threadName?: string;
  threadId?: string;
  createdAt: Date;
}

export function isAnonMessage(text: string) {
  const restArgs = text.split(' ').slice(1);
  return (
    restArgs.length === 1 && ['익명', 'ㅇㅇ', 'anon'].includes(restArgs[0])
  );
}

function getSenderName(guildMember: GuildMember | undefined) {
  if (!guildMember) return `ㅇㅇ (${getRandomTelecomIP()}.)`;
  return (
    guildMember.nickname ??
    guildMember.displayName ??
    guildMember.user.displayName ??
    guildMember.user.globalName ??
    guildMember.user.username ??
    `ㅇㅇ (${getRandomTelecomIP()}.)`
  );
}

export function getAvatarUrl(guildMember: GuildMember | undefined) {
  if (!guildMember) return '';
  return (
    guildMember.avatarURL() ??
    guildMember.displayAvatarURL() ??
    guildMember.user.avatarURL() ??
    guildMember.user.displayAvatarURL() ??
    guildMember.user.defaultAvatarURL
  );
}

export function getAbsoluteIconFilePath(icon: Icon) {
  const ICON_DIRECTORY_ROOT = path.resolve('./src/constants/icon');
  return path.join(ICON_DIRECTORY_ROOT, icon.imagePath);
}

export function getSenderId(
  message: Message | Interaction | CommandInteraction
) {
  return message instanceof Message
    ? message.author.id
    : message.member?.user.id ?? message.user.id;
}

function getGuild(guildId: string | null) {
  const guild = client.guilds.cache.find((g: Guild) => g.id === guildId);
  return guild;
}

/**
 *
 * @param guildId
 * @param memberId isMessage ? message.author.id : message.member?.user.id ?? message.user.id
 * @returns
 */
function getGuildMember(guildId: string | null, memberId: string | null) {
  const guild = getGuild(guildId);
  const member = guild?.members.cache.find(
    (gm: GuildMember) => gm.id === memberId
  );
  return member;
}

function getChannel(guildId: string | null, channelId: string | null) {
  const guild = getGuild(guildId);
  const channel = guild?.channels.cache.find(
    channel => channel.id === channelId
  );
  return channel;
}

export function createUserProfileEmbed(
  message: Message | CommandInteraction,
  { asAnonUser }: { asAnonUser: boolean } = { asAnonUser: false },
  options?: APIEmbed | EmbedData
) {
  const telecomIp = getRandomTelecomIP();
  const author: EmbedAuthorOptions = {
    name: '',
    iconURL: '',
  };

  const isMessage = message instanceof Message;

  if (asAnonUser) {
    author.name = `ㅇㅇ (${telecomIp})`;
    author.iconURL = isMessage
      ? message.author.defaultAvatarURL
      : message.user.defaultAvatarURL;
  } else {
    const guildMember = getGuildMember(message.guildId, getSenderId(message));
    author.name = getSenderName(guildMember);
    author.iconURL = getAvatarUrl(guildMember);
  }

  const avatarEmbed = new EmbedBuilder(options)
    .setColor('DarkBlue')
    .setAuthor(author)
    .setTimestamp(message.createdTimestamp);
  return avatarEmbed;
}

export async function deleteMessage(message: Message) {
  if (message.deletable) {
    try {
      return await message.delete();
    } catch (e) {
      logger.error(`An error occurred when deleting message.`);
      logger.error(e);
    }
  }
}

export function createIconEmbedMessagePayload(
  message: Message,
  matchKeyword: string,
  matchIcon: Icon,
  asAnonUser: boolean
) {
  if (matchIcon.isRemoteImage) {
    const userProfileEmbed = createUserProfileEmbed(
      message,
      {
        asAnonUser,
      },
      {
        image: {
          url: matchIcon.imagePath,
          width: 100,
          height: 100,
        },
      }
    ).setDescription(matchKeyword);

    return {
      flags: MessageFlags.SuppressNotifications,
      embeds: [userProfileEmbed],
    } as const;
  } else {
    // 첨부 이미지 이름을 한글로하면 임베드가 되지 않음.
    const imageExtension = matchIcon.imagePath.split('.').pop();
    const imageAttachment = new AttachmentBuilder(matchIcon.imagePath, {
      name: `image.${imageExtension}`,
      description: matchKeyword,
    });

    const userProfileEmbed = createUserProfileEmbed(
      message,
      {
        asAnonUser,
      },
      {
        image: {
          url: `attachment://${imageAttachment.name}`,
          width: 100,
          height: 100,
        },
      }
    ).setDescription(imageAttachment.description);

    return {
      flags: MessageFlags.SuppressNotifications,
      embeds: [userProfileEmbed],
      files: [imageAttachment],
    } as const;
  }
}

export function createIconFileMessagePayload(matchIcon: Icon) {
  return {
    flags: MessageFlags.SuppressNotifications,
    files: [{ attachment: matchIcon.imagePath }],
  } as const;
}

export const getLogContext = (
  message: Message | Interaction | CommandInteraction
): LogContext | undefined => {
  const isMessage = message instanceof Message;

  const guildMember = getGuildMember(message.guildId, getSenderId(message));
  const channel = getChannel(message.guildId, message.channelId);

  const senderName = guildMember ? getSenderName(guildMember) : '';

  const channel_truncated: GuildBasedChannel | undefined = (() => {
    if (channel) {
      return {
        ...channel,
        guild: {
          ...channel.guild,
          members: null,
          channels: null,
          roles: null,
          emojis: null,
          stickers: null,
        },
      } as unknown as GuildBasedChannel;
    }
    return undefined;
  })();

  return {
    senderName,
    senderMessage: isMessage ? message.content : `${message.context}`,
    senderId: guildMember?.id || '',
    messageId: message.id,
    messageType: message.type,
    attachments: isMessage
      ? message.attachments.map(attachment => attachment.toJSON())
      : [],
    components: isMessage ? message.components : [],
    embeds: isMessage ? message.embeds : [],
    guildMember,
    guildName: guildMember?.guild?.name || '',
    guildId: guildMember?.guild?.id || '',
    channel: channel_truncated,
    channelName: channel?.name || '',
    channelId: channel?.id || '',
    threadName: isMessage ? message.thread?.name : undefined,
    threadId: isMessage ? message.thread?.id : undefined,
    createdAt: message.createdAt,
  };
};

/**
 *
 * @param image base64 encoded
 */
export function base64ImageToAttachment(
  image: string,
  { ext = 'png', spoiler = false }: { ext?: string; spoiler?: boolean }
) {
  const base64Image = image.startsWith('data:')
    ? image
    : `data:image/${ext};base64,${image}`;

  const imageStream = Buffer.from(base64Image.split('base64,')[1], 'base64');
  const file = new AttachmentBuilder(imageStream, {
    name: `${spoiler ? 'SPOILER_' : ''}image.${ext}`,
  });
  return file;
}
