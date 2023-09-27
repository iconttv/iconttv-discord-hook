import { Icon } from "../../models";
import path from "path";
import client from "../../lib/discord";

import {
  EmbedBuilder,
  type Collection,
  type Guild,
  type GuildMember,
  type Message,
  EmbedAuthorOptions,
  AttachmentBuilder,
  MessageFlags,
} from 'discord.js';
import { getRandomTelecomIP } from '../telecomIP';
import GuildMemberCache from '../../repository/search/GuildMemberCache';
import logger from '../../lib/logger';

export function isAnonMessage(text: string) {
  const restArgs = text.split(' ').slice(1);
  return (
    restArgs.length === 1 && ['익명', 'ㅇㅇ', 'anon'].includes(restArgs[0])
  );
}

export function getSenderName(guildMember: GuildMember | null) {
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

export function getGuildMemberFromMessage(
  message: Message
): GuildMember | null {
  const cachedValue = GuildMemberCache.instance.getCache(message.author.id);
  if (cachedValue) return cachedValue;

  const guilds: Collection<string, Guild> = client.guilds.cache.filter(
    (g: Guild) => g.id === message.guildId
  );
  const guild = guilds.first();
  if (!guild) return null;

  const members: Collection<string, GuildMember> = guild.members.cache.filter(
    (gm: GuildMember) => gm.id === message.author.id
  );
  const member = members.first();
  if (!member) return null;

  GuildMemberCache.instance.setCache(message.author.id, member);
  return member;
}

export function createUserProfileEmbed(
  message: Message,
  { asAnonUser }: { asAnonUser: boolean } = { asAnonUser: false }
) {
  const telecomIp = getRandomTelecomIP();
  const author: EmbedAuthorOptions = {
    name: '',
    iconURL: '',
  };

  if (asAnonUser) {
    author.name = `ㅇㅇ (${telecomIp})`;
    author.iconURL = message.author.defaultAvatarURL;
  } else {
    const guildMember = getGuildMemberFromMessage(message);
    // author.name =
    //   guildMember?.nickname ??
    //   guildMember?.user.globalName ??
    //   guildMember?.user.displayName ??
    //   `ㅇㅇ (${telecomIp})`;
    author.name = getSenderName(guildMember);
    author.iconURL = getAvatarUrl(guildMember);
  }

  const avaterEmbed = new EmbedBuilder().setColor('DarkBlue').setAuthor(author);
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

export async function sendIconMessage(
  message: Message,
  matchIcon: Icon,
  asAnonUser: boolean
) {
  const userProfileEmbed = createUserProfileEmbed(message, {
    asAnonUser,
  });

  try {
    if (matchIcon.isRemoteImage) {
      await message.channel.send({
        flags: MessageFlags.SuppressNotifications,
        embeds: [
          userProfileEmbed
            .setDescription(matchIcon.keywords[0])
            .setImage(matchIcon.imagePath),
        ],
      });
    } else {
      // 첨부 이미지 이름을 한글로하면 임베드가 되지 않음.
      const imageExtension = matchIcon.imagePath.split('.').pop();
      const imageAttachment = new AttachmentBuilder(matchIcon.imagePath, {
        name: `image.${imageExtension}`,
        description: matchIcon.keywords[0],
      });

      await message.channel.send({
        flags: MessageFlags.SuppressNotifications,
        embeds: [
          userProfileEmbed
            .setDescription(imageAttachment.description)
            .setImage(`attachment://${imageAttachment.name}`),
        ],
        files: [imageAttachment],
      });
    }
  } catch (e) {
    logger.error(`An Error occurred when sending icon message.`);
    logger.error(e);
  }
}
