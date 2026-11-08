import { Client, type estypes } from '@elastic/elasticsearch';
import {
  buildTextSearchQuery,
  buildEmbeddingSearchQuery,
  type MessageSearchOptions,
} from './elasticSearchQuery';
import { config } from '../config';
import { getMessageLink } from '../utils/message';

// you should import fetch from 'node-fetch',
// else `fetch failed TypeError: fetch failed` occurs
import { aiClient } from './embedding/client';

let _elasticClient: Client;

export const getElasticClient = () => {
  if (
    !config.ELASTIC_HOST ||
    config.ELASTIC_HOST.length === 0 ||
    !config.ELASTIC_API ||
    config.ELASTIC_API.length === 0
  ) {
    throw new Error('elastic host and api is not set.');
  }

  const [id, api_key] = config.ELASTIC_API.split(':');
  if (!_elasticClient) {
    _elasticClient = new Client({
      node: config.ELASTIC_HOST,
      auth: {
        apiKey: {
          id,
          api_key,
        },
      },
    });
  }
  return _elasticClient;
};

const getEmbeddingQueryInstruct = (query: string) => {
  return (
    'Instruct: Retrieve relevant messages that best matches the query' +
    `\n${query}`
  );
};

interface SearchResultSource {
  '@timestamp': string;
  guildId: string;
  channelId: string;
  messageId: string;
  message: string;
  embeddingInput: string;
  link: string;
  senderId?: string;
  senderName?: string;
  raw?: unknown;
}

const normalizeSearchResultSource = (
  source: SearchResultSource
): SearchResultSource => {
  source['@timestamp'] = new Date(source['@timestamp']).toLocaleString();
  source.link = getMessageLink(
    source.guildId,
    source.channelId,
    source.messageId
  );
  source.message = cleanEmbeddingInput(source.embeddingInput);
  return source;
};

const cleanEmbeddingInput = (text: string): string => {
  return text
    .split('\n')
    .filter(line => line.trim().length > 0 && !line.startsWith('#'))
    .join('\n');
};

export class MessageSearchBackendError extends Error {
  constructor(readonly cause: unknown) {
    super('Elasticsearch search failed.');
  }
}

type SearchResponse = estypes.SearchResponse<SearchResultSource>;
const executeMessageSearch = async (
  query: estypes.SearchRequest,
  options: MessageSearchOptions
): Promise<SearchResponse> => {
  try {
    return await getElasticClient().search<SearchResultSource>(
      query,
      options.raw ? { requestTimeout: 5000, maxRetries: 0 } : undefined
    );
  } catch (error) {
    throw new MessageSearchBackendError(error);
  }
};

export function searchMessage(
  guildId: string,
  keyword: string,
  channelId: string | null,
  options: MessageSearchOptions & { raw: true }
): Promise<SearchResponse>;
export function searchMessage(
  guildId: string,
  keyword: string,
  channelId: string | null,
  options?: MessageSearchOptions & { raw?: false }
): Promise<SearchResultSource[]>;
export async function searchMessage(
  guildId: string,
  keyword: string,
  channelId: string | null,
  options: MessageSearchOptions = {}
): Promise<SearchResponse | SearchResultSource[]> {
  const result = await executeMessageSearch(
    buildTextSearchQuery(guildId, keyword, channelId, options),
    options
  );
  return options.raw
    ? result
    : result.hits.hits.map(hit => normalizeSearchResultSource(hit._source!));
}

export function searchMessageEmbedding(
  guildId: string,
  keyword: string,
  channelId: string | null,
  options: MessageSearchOptions & { raw: true }
): Promise<SearchResponse>;
export function searchMessageEmbedding(
  guildId: string,
  keyword: string,
  channelId: string | null,
  options?: MessageSearchOptions & { raw?: false }
): Promise<SearchResultSource[]>;
export async function searchMessageEmbedding(
  guildId: string,
  keyword: string,
  channelId: string | null,
  options: MessageSearchOptions = {}
): Promise<SearchResponse | SearchResultSource[]> {
  const vector = await aiClient.createEmbeddingText(
    getEmbeddingQueryInstruct(keyword)
  );
  const result = await executeMessageSearch(
    buildEmbeddingSearchQuery(guildId, channelId, vector, options),
    options
  );
  return options.raw
    ? result
    : result.hits.hits.map(hit => normalizeSearchResultSource(hit._source!));
}

export const getMemberPortion = async (
  guildId: string,
  senderId: string,
  channelId?: string
) => {
  const client = getElasticClient();
  const index = 'iconttv-discord-message_*';

  const filters: Array<Record<string, unknown>> = [{ term: { guildId } }];

  if (channelId) {
    filters.push({ term: { channelId } });
  }

  const baseQuery = {
    bool: {
      filter: filters,
    },
  };

  const senderQuery = {
    bool: {
      filter: [...filters, { term: { senderId } }],
    },
  };

  const [totalCountResult, senderCountResult] = await Promise.all([
    client.count({
      index,
      query: baseQuery,
    }),
    client.count({
      index,
      query: senderQuery,
    }),
  ]);

  const totalCount = totalCountResult.count ?? 0;
  const senderCount = senderCountResult.count ?? 0;
  const portion = totalCount === 0 ? 0 : senderCount / totalCount;

  return {
    guildId,
    channelId: channelId ?? null,
    senderId,
    totalCount,
    senderCount,
    portion, // 0 ~ 1
    percentage: portion * 100, // 0 ~ 100
  };
};
