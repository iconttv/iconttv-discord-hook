import { GuildMember } from 'discord.js';
import { config } from '../../config';
import logger from '../../lib/logger';

interface GuildMemberCacheStorage {
  value: GuildMember;
  createdAt: number;
}

export default class GuildMemberCache {
  private static _instance: GuildMemberCache;
  private static _clearIntervalId: NodeJS.Timeout;
  private _guildNameCache: Record<string, GuildMemberCacheStorage | null> = {};

  private constructor() {
    logger.debug(`GuildMemberCache Created`);
  }

  static get instance() {
    if (!this._instance) {
      this._instance = new GuildMemberCache();
      this._clearIntervalId = setInterval(
        this._instance.clearOldCache,
        config.CACHE_CLEAR_CHECK_TIME_MS
      );
    }
    return this._instance;
  }

  clearOldCache() {
    for (const key in this._guildNameCache) {
      const cache = this._guildNameCache[key];
      if (cache === null) {
        delete this._guildNameCache[key];
        continue;
      }

      if (Date.now() - cache.createdAt > 10 * 60 * 1000) {
        logger.debug(`GuildMemberCache delete old cache ${key}`);
        this._guildNameCache[key] = null;
        delete this._guildNameCache[key];
      }
    }
  }

  getCache(key: string): GuildMember | null {
    if (!(key in this._guildNameCache)) return null;
    const result = this._guildNameCache[key];
    if (result === null) return null;
    return result.value;
  }

  setCache(key: string, value: GuildMember) {
    this._guildNameCache[key] = {
      value,
      createdAt: Date.now(),
    };
  }
}
