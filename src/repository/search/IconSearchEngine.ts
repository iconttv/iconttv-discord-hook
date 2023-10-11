import logger, { channel_log_message } from '../../lib/logger';
import { Icon } from '../../models';
import { IconRepository } from '../icons';
import { IconFunzinnuRepository } from '../icons/funzinnu';
import { IconJindolRepository } from '../icons/jindol';

// 1hour
const MAX_CACHE_AGE = 60 * 60 * 1000;

interface MatchIconCacheElement {
  icon: Icon;
  createdAtMs: number;
}

export default class IconSearchEngine {
  private static _instance: IconSearchEngine;
  private _repositories: Record<string, IconRepository>;
  private _cache: Record<string, MatchIconCacheElement>;

  private constructor() {
    this._repositories = {
      jindol: IconJindolRepository.instance,
      funzinnu: IconFunzinnuRepository.instance,
    };

    /**
     * {
     *   "guildId searchKeyword": {}
     * }
     */
    this._cache = {};
  }

  static get instance() {
    if (!this._instance) this._instance = new IconSearchEngine();
    return this._instance;
  }

  async searchIcon(
    searchKeyword: string,
    guildId: string | null,
    providers: string[] = [],
    messageContext: Record<string, string | number | undefined> = {}
  ): Promise<Icon | null> {
    const cacheKey = `${guildId} ${searchKeyword}`;
    const cachedValue = this._cache[cacheKey];
    if (cachedValue) {
      if (!this.isExpiredCache(cachedValue.createdAtMs)) {
        logger.debug(
          channel_log_message(
            `Found "${searchKeyword}" in memory cache`,
            messageContext
          )
        );
        return cachedValue.icon;
      }
      delete this._cache[cacheKey];
    }

    const iconProviders: [string, IconRepository][] =
      providers.length === 0
        ? Object.entries(this._repositories)
        : Object.entries(this._repositories).filter(([repositoryProvider]) =>
            providers.includes(repositoryProvider)
          );

    for (const [providerName, iconProvider] of iconProviders) {
      const matchIcon = await iconProvider.findOne(searchKeyword);
      if (matchIcon) {
        matchIcon.imagePath = iconProvider.imagePathResolver(
          matchIcon.imagePath
        );

        logger.debug(
          channel_log_message(
            `Found "${searchKeyword}" in "${providerName}"`,
            messageContext
          )
        );
        this._cache[cacheKey] = {
          icon: matchIcon,
          createdAtMs: Date.now(),
        };
        return matchIcon;
      }
    }

    logger.debug(
      channel_log_message(
        `Icon keyword "${searchKeyword}" not found.`,
        messageContext
      )
    );
    return null;
  }

  private isExpiredCache(createdAtMs: number) {
    return Date.now() - createdAtMs > MAX_CACHE_AGE;
  }
}
