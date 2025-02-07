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
  ActionRow,
  MessageActionRowComponent,
  Embed,
  APIEmbed,
  EmbedData,
  TextChannel,
} from 'discord.js';
import path from 'path';

import { Icon } from '../../models/index';
import client from '../../lib/discord';
import { getRandomTelecomIP } from '../telecomIP';
import logger from '../../lib/logger';

export interface MessageLogContext {
  senderName: string;
  senderMessage: string;
  senderId: string;
  messageId: string;
  messageType: number;
  attachments: unknown[];
  components: ActionRow<MessageActionRowComponent>[];
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

function getGuildMemberFromMessage(message: Message): GuildMember | undefined {
  // const cachedValue = GuildMemberCache.instance.getCache(message.author.id);
  // if (cachedValue) return cachedValue;

  const guild = client.guilds.cache.find(
    (g: Guild) => g.id === message.guildId
  );
  if (!guild) return;

  return getGuildMemberFromGuildAndUserId(guild, message.author.id);
}

function getGuildMemberFromGuildAndUserId(
  guild: Guild | null,
  userId: string
): GuildMember | undefined {
  if (!guild) return;

  const member = guild.members.cache.find(
    (gm: GuildMember) => gm.id === userId
  );
  if (!member) return;

  // GuildMemberCache.instance.setCache(userId, member);
  return member;
}

function getGuildMember(
  message: Message | CommandInteraction
): GuildMember | undefined {
  if (message instanceof Message) return getGuildMemberFromMessage(message);
  return getGuildMemberFromGuildAndUserId(message.guild, message.user.id);
}

function getChannelFromMessage(message: Message) {
  const channel = message.guild?.channels.cache.find(
    channel => channel.id === message.channelId
  );
  if (!channel) return undefined;
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
    const guildMember = getGuildMember(message);
    // author.name =
    //   guildMember?.nickname ??
    //   guildMember?.user.globalName ??
    //   guildMember?.user.displayName ??
    //   `ㅇㅇ (${telecomIp})`;
    author.name = getSenderName(guildMember);
    author.iconURL = getAvatarUrl(guildMember);
  }

  const avaterEmbed = new EmbedBuilder(options)
    .setColor('DarkBlue')
    .setAuthor(author);
  return avaterEmbed;
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

export async function sendIconMessageEmbed(
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

    /**
     * https://github.com/discordjs/discord.js/issues/3622
     * 위에서 분기문으로 return 전송 가능한 채널이어도 전송 못할 수 있음.
     * 그냥 에러 발생하는게 더 안정적일 것 같음
     */
    return await (message.channel as TextChannel).send({
      flags: MessageFlags.SuppressNotifications,
      embeds: [userProfileEmbed],
    });
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

    return await (message.channel as TextChannel).send({
      flags: MessageFlags.SuppressNotifications,
      embeds: [userProfileEmbed],
      files: [imageAttachment],
    });
  }
}

export async function sendIconMessage(message: Message, matchIcon: Icon) {
  return await (message.channel as TextChannel).send({
    flags: MessageFlags.SuppressNotifications,
    files: [{ attachment: matchIcon.imagePath }],
  });
}

export const getMessageLogContext = (
  message: Message
): MessageLogContext | undefined => {
  const guildMember = getGuildMemberFromMessage(message);
  const channel = getChannelFromMessage(message);
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
    senderMessage: message.content,
    senderId: guildMember?.id || '',
    messageId: message.id,
    messageType: message.type,
    attachments: message.attachments.map(attachment => attachment.toJSON()),
    components: message.components,
    embeds: message.embeds,
    guildMember,
    guildName: guildMember?.guild?.name || '',
    guildId: guildMember?.guild?.id || '',
    channel: channel_truncated,
    channelName: channel?.name || '',
    channelId: channel?.id || '',
    threadName: message.thread?.name,
    threadId: message.thread?.id,
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
