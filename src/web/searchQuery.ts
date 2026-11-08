import type { estypes } from '@elastic/elasticsearch';
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
  const allowed = session.channels.map(channel => channel.id);
  if (options.channelId && !allowed.includes(options.channelId))
    throw new Error('Channel is outside session scope.');
  const filter: estypes.QueryDslQueryContainer[] = [
    { term: { guildId: session.guildId } },
    { terms: { channelId: options.channelId ? [options.channelId] : allowed } },
    { exists: { field: 'messageId' } },
  ];
  if (options.after || options.before)
    filter.push({
      range: {
        '@timestamp': {
          ...(options.after ? { gte: `${options.after}T00:00:00.000Z` } : {}),
          ...(options.before ? { lte: `${options.before}T23:59:59.999Z` } : {}),
        },
      },
    });
  const bool: estypes.QueryDslBoolQuery = {
    filter,
    must_not: [{ term: { isDeleted: true } }],
  };
  let query: estypes.QueryDslQueryContainer;
  if (options.mode === 'semantic') {
    if (!vector?.length)
      throw new Error('Embedding is required for semantic search.');
    filter.push({ exists: { field: 'embedding' } });
    query = {
      script_score: {
        query: { bool },
        script: {
          source: "cosineSimilarity(params.vector, 'embedding') + 1.0",
          params: { vector },
        },
      },
    };
  } else if (options.keyword) {
    bool.must = [
      {
        simple_query_string: {
          query: options.keyword,
          fields: ['embeddingInput'],
          default_operator: 'and',
          flags: 'AND|OR|NOT|PHRASE|PREFIX|WHITESPACE|ESCAPE',
        },
      },
    ];
    query = { bool };
  } else query = { bool };
  return {
    index: 'iconttv-discord-message_*',
    from: (options.page - 1) * WEB_PAGE_SIZE,
    size: WEB_PAGE_SIZE + 1,
    track_total_hits: true,
    timeout: '10s',
    _source: [
      '@timestamp',
      'guildId',
      'channelId',
      'messageId',
      'senderId',
      'senderName',
      'embeddingInput',
      'message',
    ],
    query,
    sort:
      options.sort === 'relevance'
        ? [
            { _score: { order: 'desc' } },
            { '@timestamp': 'desc' },
            { messageId: 'asc' },
          ]
        : [
            { '@timestamp': options.sort === 'oldest' ? 'asc' : 'desc' },
            { messageId: 'asc' },
          ],
  };
};
