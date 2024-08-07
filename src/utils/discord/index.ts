import { Icon } from '../../models/index.js';
import path from 'path';
import client from '../../lib/discord.js';

import {
  EmbedBuilder,
  type Collection,
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
} from 'discord.js';
import { getRandomTelecomIP } from '../telecomIP.js';
import GuildMemberCache from '../../repository/search/GuildMemberCache.js';
import logger from '../../lib/logger.js';

export interface MessageLogContext {
  senderName: string;
  senderMessage: string;
  senderId: string;
  messageId: string;
  messageType: number;
  attachments: unknown[];
  components: ActionRow<MessageActionRowComponent>[];
  embeds: Embed[];
  guildName: string;
  guildId: string;
  channelName: string;
  channelId: string;
  threadName?: string;
  threadId?: string;
  createdAt: Date;
}

export interface MessageContext extends MessageLogContext {
  guildMember: GuildMember;
  channel: GuildBasedChannel;
}

export function isAnonMessage(text: string) {
  const restArgs = text.split(' ').slice(1);
  return (
    restArgs.length === 1 && ['익명', 'ㅇㅇ', 'anon'].includes(restArgs[0])
  );
}

function getSenderName(guildMember: GuildMember | null) {
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

export function getAvatarUrl(guildMember: GuildMember | null) {
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

function getGuildMemberFromMessage(message: Message): GuildMember | null {
  const cachedValue = GuildMemberCache.instance.getCache(message.author.id);
  if (cachedValue) return cachedValue;

  const guilds: Collection<string, Guild> = client.guilds.cache.filter(
    (g: Guild) => g.id === message.guildId
  );
  const guild = guilds.first();
  if (!guild) return null;

  return getGuildMemberFromGuildAndUserId(guild, message.author.id);
}

function getGuildMemberFromGuildAndUserId(
  guild: Guild | null,
  userId: string
): GuildMember | null {
  if (!guild) return null;

  const members: Collection<string, GuildMember> = guild.members.cache.filter(
    (gm: GuildMember) => gm.id === userId
  );
  const member = members.first();
  if (!member) return null;

  GuildMemberCache.instance.setCache(userId, member);
  return member;
}

function getGuildMember(
  message: Message | CommandInteraction
): GuildMember | null {
  if (message instanceof Message) return getGuildMemberFromMessage(message);
  return getGuildMemberFromGuildAndUserId(message.guild, message.user.id);
}

function getChannelFromMessage(message: Message) {
  return message.guild?.channels.cache.find(
    channel => channel.id === message.channelId
  );
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
      await message.delete();
    } catch (e) {
      logger.error(`An error occurred when deleting message.`);
      logger.error(e);
    }
  }
}

export async function sendIconMessageEmbed(
  message: Message,
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
    );

    await message.channel.send({
      flags: MessageFlags.SuppressNotifications,
      embeds: [userProfileEmbed.setDescription(matchIcon.keywords[0])],
    });
  } else {
    // 첨부 이미지 이름을 한글로하면 임베드가 되지 않음.
    const imageExtension = matchIcon.imagePath.split('.').pop();
    const imageAttachment = new AttachmentBuilder(matchIcon.imagePath, {
      name: `image.${imageExtension}`,
      description: matchIcon.keywords[0],
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
    );

    await message.channel.send({
      flags: MessageFlags.SuppressNotifications,
      embeds: [userProfileEmbed.setDescription(imageAttachment.description)],
      files: [imageAttachment],
    });
  }
}

export async function sendIconMessage(message: Message, matchIcon: Icon) {
  await message.channel.send({
    flags: MessageFlags.SuppressNotifications,
    files: [{ attachment: matchIcon.imagePath }],
  });
}

export const getMessageContext = (
  message: Message
): MessageContext | undefined => {
  const guildMember = getGuildMemberFromMessage(message);
  if (!guildMember) return;

  const channel = getChannelFromMessage(message);
  if (!channel) return;

  const senderName = getSenderName(guildMember);

  return {
    senderName,
    senderMessage: message.content,
    senderId: guildMember.id,
    messageId: message.id,
    messageType: message.type,
    attachments: message.attachments.map(attachment => attachment.toJSON()),
    components: message.components,
    embeds: message.embeds,
    guildMember: guildMember,
    guildName: guildMember.guild.name,
    guildId: guildMember.guild.id,
    channelName: channel.name,
    channelId: channel.id,
    channel,
    threadName: message.thread?.name,
    threadId: message.thread?.id,
    createdAt: message.createdAt,
  };
};

export const getMessageLogContext = (
  message: Message
): MessageLogContext | undefined => {
  const guildMember = getGuildMemberFromMessage(message);
  const channel = getChannelFromMessage(message);
  const senderName = guildMember !== null ? getSenderName(guildMember) : '';

  return {
    senderName,
    senderMessage: message.content,
    senderId: guildMember?.id || '',
    messageId: message.id,
    messageType: message.type,
    attachments: message.attachments.map(attachment => attachment.toJSON()),
    components: message.components,
    embeds: message.embeds,
    guildName: guildMember?.guild?.name || '',
    guildId: guildMember?.guild?.id || '',
    channelName: channel?.name || '',
    channelId: channel?.id || '',
    threadName: message.thread?.name,
    threadId: message.thread?.id,
    createdAt: message.createdAt,
  };
};
