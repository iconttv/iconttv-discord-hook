import iconList from "../constants/iconList";
import { Icon } from "../models";
import path from "path";
import client from "../lib/discord";

import {
  EmbedBuilder,
  type Collection,
  type Guild,
  type GuildMember,
  type Message,
  EmbedAuthorOptions,
} from "discord.js";
import { getRandomTelecomIP } from "./telecomIP";

interface GuildMemberCacheStorage {
  value: GuildMember;
  createdAt: number;
}
class GuildMemberCache {
  private static _instance: GuildMemberCache;
  private _guildNameCache: Record<string, GuildMemberCacheStorage> = {};

  static get instance() {
    if (!this._instance) this._instance = new GuildMemberCache();
    return this._instance;
  }

  getCache(key: string): GuildMember | null {
    if (!(key in this._guildNameCache)) return null;
    const result = this._guildNameCache[key];
    if (Date.now() - result.createdAt > 60 * 1000) {
      delete this._guildNameCache[key];
      return null;
    }
    return result.value;
  }

  setCache(key: string, value: GuildMember) {
    this._guildNameCache[key] = {
      value,
      createdAt: Date.now(),
    };
  }
}

export function findMatchIconOrNull(text: string): [Icon, boolean] | null {
  if (!text.startsWith("~")) return null;
  const [iconCommand, ...restArgs] = text.split(" ");
  if (restArgs.includes(" ")) return null;

  // remove starting `~`
  const keyword = iconCommand.slice(1);

  const matchIcon = iconList.filter((icon) =>
    icon.keywords
      .map((kw) => kw.toLocaleLowerCase())
      .includes(keyword.toLocaleLowerCase())
  );

  const isAnonMessage =
    restArgs.length === 1 && ["익명", "ㅇㅇ", "anon"].includes(restArgs[0]);

  if (matchIcon.length === 0) return null;
  return [matchIcon[0], isAnonMessage];
}

export function getAbsoluteIconFilePath(icon: Icon) {
  const ICON_DIRECTORY_ROOT = path.resolve("./src/constants/icon");
  return path.join(ICON_DIRECTORY_ROOT, icon.filePath);
}

export function getGuildMemberFromMessage(message: Message) {
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
    author.name =
      guildMember?.nickname ??
      guildMember?.user.globalName ??
      guildMember?.user.displayName ??
      `ㅇㅇ (${telecomIp})`;
    author.iconURL =
      guildMember?.avatarURL() ??
      guildMember?.displayAvatarURL() ??
      guildMember?.user.avatarURL() ??
      guildMember?.user.displayAvatarURL();
  }

  const avaterEmbed = new EmbedBuilder().setColor("DarkBlue").setAuthor(author);
  return avaterEmbed;
}
