import logger, { channel_log_message } from '../../lib/logger';
import { Icon } from '../../models/index';
import { MessageLogContext } from '../../utils/discord/index';
import { IconRepository } from '../icons/index';
import { IconFunzinnuRepository } from '../icons/funzinnu/index';
import { IconSmalljuzi6974Repository } from '../icons/smalljuzi6974/index';
import { config } from '../../config';
import { copyIcon } from '../../utils/iconttv';

// 1hour
const MAX_CACHE_AGE = 60 * 60 * 1000;

interface MatchIconCacheElement {
  icon: Icon;
  createdAt: number;
}

export default class IconSearchEngine {
  private static _instance: IconSearchEngine;
  private static _clearIntervalId: NodeJS.Timeout;
  private _repositories: Record<string, IconRepository>;
  private _cache: Record<string, MatchIconCacheElement | null>;

  private constructor() {
    logger.debug(`IconSearchEngine Created`);
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
    if (!this._instance) {
      this._instance = new IconSearchEngine();
      this._clearIntervalId = setInterval(
        this._instance.clearOldCache,
        config.CACHE_CLEAR_CHECK_TIME_MS
      );
    }
    return this._instance;
  }

  clearOldCache() {
    for (const key in this._cache) {
      const cache = this._cache[key];
      if (cache === null) {
        delete this._cache[key];
        continue;
      }

      if (Date.now() - cache.createdAt > MAX_CACHE_AGE) {
        logger.debug(`IconSearchEngine delete old cache ${key}`);
        this._cache[key] = null;
        delete this._cache[key];
      }
    }
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
      logger.debug(
        channel_log_message(
          `Found "${searchKeyword}" in memory cache`,
          messageLogContext
        )
      );
      return copyIcon(cachedValue.icon);
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
        return copyIcon(matchIcon);
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
