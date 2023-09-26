import { GuildMember } from "discord.js";

interface GuildMemberCacheStorage {
  value: GuildMember;
  createdAt: number;
}

export default class GuildMemberCache {
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
