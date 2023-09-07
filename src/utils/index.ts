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
} from "discord.js";

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

export function findMatchIconOrNull(text: string): Icon | null {
  if (!text.startsWith("~")) return null;
  if (text.includes(" ")) return null;

  // remove starting `~`
  const keyword = text.slice(1);

  const matchIcon = iconList.filter((icon) =>
    icon.keywords
      .map((kw) => kw.toLocaleLowerCase())
      .includes(keyword.toLocaleLowerCase())
  );

  if (matchIcon.length === 0) return null;
  return matchIcon[0];
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

export function createUserProfileEmbed(message: Message) {
  const guildMember = getGuildMemberFromMessage(message);
  const name = guildMember?.nickname ?? "ㅇㅇ (223.38)";
  const avatarURL =
    guildMember?.avatarURL() ??
    guildMember?.displayAvatarURL() ??
    guildMember?.user.avatarURL() ??
    guildMember?.user.displayAvatarURL();

  const avaterEmbed = new EmbedBuilder().setColor("DarkBlue").setAuthor({
    name,
    iconURL: avatarURL,
  });
  return avaterEmbed;
}