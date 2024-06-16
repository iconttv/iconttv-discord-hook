import logger, { channel_log_message } from '../../lib/logger';
import { Icon } from '../../models';
import { MessageLogContext } from '../../utils/discord';
import { IconRepository } from '../icons';
import { IconFunzinnuRepository } from '../icons/funzinnu';
import { IconSmalljuzi6974Repository } from '../icons/smalljuzi6974';
import { cloneDeep } from 'lodash';

// 1hour
const MAX_CACHE_AGE = 60 * 60 * 1000;

interface MatchIconCacheElement {
  icon: Icon;
  createdAt: number;
}

export default class IconSearchEngine {
  private static _instance: IconSearchEngine;
  private _repositories: Record<string, IconRepository>;
  private _cache: Record<string, MatchIconCacheElement>;

  private constructor() {
    this._repositories = {
      smalljuzi6974: new IconSmalljuzi6974Repository(),
      funzinnu: new IconFunzinnuRepository(),
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
    messageLogContext: MessageLogContext | Record<string, unknown> = {}
  ): Promise<Icon | null> {
    const cacheKey = `${guildId} ${searchKeyword}`;
    const cachedValue = this._cache[cacheKey];
    if (cachedValue) {
      if (!this.isExpiredCache(cachedValue.createdAt)) {
        logger.debug(
          channel_log_message(
            `Found "${searchKeyword}" in memory cache`,
            messageLogContext
          )
        );
        return cloneDeep(cachedValue.icon);
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
            messageLogContext
          )
        );
        this._cache[cacheKey] = {
          icon: matchIcon,
          createdAt: Date.now(),
        };
        return matchIcon;
      }
    }

    logger.debug(
      channel_log_message(
        `Icon keyword "${searchKeyword}" not found.`,
        messageLogContext
      )
    );
    return null;
  }

  private isExpiredCache(createdAtMs: number) {
    return Date.now() - createdAtMs > MAX_CACHE_AGE;
  }
}
