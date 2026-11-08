import type { estypes } from '@elastic/elasticsearch';

export interface MessageSearchOptions {
  allowedChannelIds?: string[];
  after?: string;
  before?: string;
  sort?: 'relevance' | 'newest' | 'oldest';
  offset?: number;
  limit?: number;
  raw?: boolean;
}

const baseQuery = (
  guildId: string,
  channelId: string | null,
  options: MessageSearchOptions
): estypes.QueryDslBoolQuery => {
  if (
    channelId &&
    options.allowedChannelIds &&
    !options.allowedChannelIds.includes(channelId)
  )
    throw new Error('Channel is outside session scope.');
  const filter: estypes.QueryDslQueryContainer[] = [
    { term: { guildId } },
    { exists: { field: 'channelId' } },
    { exists: { field: 'messageId' } },
  ];
  if (options.allowedChannelIds)
    filter.push({ terms: { channelId: options.allowedChannelIds } });
  if (channelId) filter.push({ term: { channelId } });
  if (options.after || options.before)
    filter.push({
      range: {
        '@timestamp': {
          ...(options.after ? { gte: `${options.after}T00:00:00.000Z` } : {}),
          ...(options.before ? { lte: `${options.before}T23:59:59.999Z` } : {}),
        },
      },
    });
  return { filter, must_not: [{ term: { isDeleted: true } }] };
};

const request = (
  query: estypes.QueryDslQueryContainer,
  options: MessageSearchOptions,
  defaultSize: number,
  defaultSort: 'relevance' | 'newest'
): estypes.SearchRequest => ({
  index: 'iconttv-discord-message_*',
  from: options.offset ?? 0,
  size: options.limit ?? defaultSize,
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
    (options.sort ?? defaultSort) === 'relevance'
      ? [{ _score: { order: 'desc' } }, { '@timestamp': 'desc' }, { messageId: 'asc' }]
      : [
          { '@timestamp': options.sort === 'oldest' ? 'asc' : 'desc' },
          { messageId: 'asc' },
        ],
});

export const buildTextSearchQuery = (
  guildId: string,
  keyword: string,
  channelId: string | null,
  options: MessageSearchOptions = {}
) => {
  const bool = baseQuery(guildId, channelId, options);
  if (!keyword.trim()) return request({ bool }, options, 10, 'newest');
  const queryString = / AND | OR | NOT /.test(keyword)
    ? keyword
    : keyword.split(' ').filter(Boolean).join(' AND ');
  bool.must = [
    { exists: { field: 'embeddingInput' } },
    { query_string: { default_field: 'embeddingInput', query: queryString } },
  ];
  return request(
    {
      function_score: {
        query: { bool },
        functions: [
          {
            gauss: {
              '@timestamp': { origin: 'now', scale: '30d', decay: 0.5 },
            },
            weight: 20,
          },
        ],
        score_mode: 'sum',
        boost_mode: 'sum',
      },
    },
    options,
    10,
    'relevance'
  );
};

export const buildEmbeddingSearchQuery = (
  guildId: string,
  channelId: string | null,
  vector: number[],
  options: MessageSearchOptions = {}
): estypes.SearchRequest => {
  if (!vector.length)
    throw new Error('Embedding is required for semantic search.');
  const bool = baseQuery(guildId, channelId, options);
  bool.must = [
    { exists: { field: 'embedding' } },
    { exists: { field: 'embeddingInput' } },
  ];
  return {
    ...request(
      {
        script_score: {
          query: { bool },
          script: {
            source: `
        double cosineSim = cosineSimilarity(params.query_vector, 'embedding') * 1.5 + 1.0;
        long timeMillis = doc['@timestamp'].value.toInstant().toEpochMilli();
        double daysDiff = (params.now - timeMillis) / (1000.0 * 60.0 * 60.0 * 24.0);
        double datePenalty = daysDiff > 30 ? (daysDiff - 30) / 365.0 : 0.0;
        return Math.max(0.0, cosineSim - datePenalty);
      `,
            params: { query_vector: vector, now: Date.now() },
          },
        },
      },
      options,
      8,
      'relevance'
    ),
    min_score: 0.44,
  };
};
