import type { estypes } from '@elastic/elasticsearch';
import {
  buildTextSearchQuery,
  buildEmbeddingSearchQuery,
} from '../service/elasticSearchQuery';
import type { WebSearchOptions, WebSearchScope } from './types';

export const WEB_PAGE_SIZE = 25;

export const buildMongoSearchFilter = (
  session: WebSearchScope,
  options: WebSearchOptions
) => {
  const allowed = session.channels.map(channel => channel.id);
  if (options.channelId && !allowed.includes(options.channelId))
    throw new Error('Channel is outside session scope.');
  return {
    guildId: session.guildId,
    channelId: { $in: options.channelId ? [options.channelId] : allowed },
    isDeleted: { $ne: true },
    ...(options.keyword
      ? {
          $and: options.keyword
            .split(/\s+/)
            .filter(Boolean)
            .slice(0, 20)
            .map(word => {
              const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
              return {
                $or: [
                  { message: { $regex: escaped, $options: 'i' } },
                  { EMBEDDING_INPUT: { $regex: escaped, $options: 'i' } },
                ],
              };
            }),
        }
      : {}),
    ...(options.after || options.before
      ? {
          createdAt: {
            ...(options.after
              ? { $gte: new Date(`${options.after}T00:00:00.000Z`) }
              : {}),
            ...(options.before
              ? { $lte: new Date(`${options.before}T23:59:59.999Z`) }
              : {}),
          },
        }
      : {}),
  };
};

export const buildWebSearchQuery = (
  session: WebSearchScope,
  options: WebSearchOptions,
  vector?: number[]
): estypes.SearchRequest => {
  const searchOptions = {
    allowedChannelIds: session.channels.map(channel => channel.id),
    after: options.after,
    before: options.before,
    sort: options.sort,
    offset: (options.page - 1) * WEB_PAGE_SIZE,
    limit: WEB_PAGE_SIZE + 1,
  };
  return options.mode === 'semantic'
    ? buildEmbeddingSearchQuery(
        session.guildId,
        options.channelId ?? null,
        vector ?? [],
        searchOptions
      )
    : buildTextSearchQuery(
        session.guildId,
        options.keyword,
        options.channelId ?? null,
        searchOptions
      );
};
