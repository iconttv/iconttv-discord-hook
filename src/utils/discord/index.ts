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
} from "discord.js";
import { getRandomTelecomIP } from "../telecomIP";
import GuildMemberCache from "../../repository/search/GuildMemberCache";

export function isAnonMessage(text: string) {
  const [_, ...restArgs] = text.split(" ");
  return (
    restArgs.length === 1 && ["익명", "ㅇㅇ", "anon"].includes(restArgs[0])
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
  if (!guildMember) return "";
  return (
    guildMember.avatarURL() ??
    guildMember.displayAvatarURL() ??
    guildMember.user.avatarURL() ??
    guildMember.user.displayAvatarURL() ??
    guildMember.user.defaultAvatarURL
  );
}

export function getAbsoluteIconFilePath(icon: Icon) {
  const ICON_DIRECTORY_ROOT = path.resolve("./src/constants/icon");
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
    name: "",
    iconURL: "",
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

  const avaterEmbed = new EmbedBuilder().setColor("DarkBlue").setAuthor(author);
  return avaterEmbed;
}
