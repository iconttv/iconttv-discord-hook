import { Client } from '@elastic/elasticsearch';
import { config } from '../config';
import { getMessageLink } from '../utils/message';

// you should import fetch from 'node-fetch',
// else `fetch failed TypeError: fetch failed` occurs
import logger from '../lib/logger';
import OpenAI from 'openai';

let _client: Client;

const getClient = () => {
  if (
    !config.ELASTIC_HOST ||
    config.ELASTIC_HOST.length === 0 ||
    !config.ELASTIC_API ||
    config.ELASTIC_API.length === 0
  ) {
    throw new Error('elastic host and api is not set.');
  }

  const [id, api_key] = config.ELASTIC_API.split(':');
  if (!_client) {
    _client = new Client({
      node: config.ELASTIC_HOST,
      auth: {
        apiKey: {
          id,
          api_key,
        },
      },
    });
  }
  return _client;
};

const getSearchQueryEmbedding = async (text: string) => {
  if (!config.EMBEDDING_OPENAI_BASEURL || !config.EMBEDDING_OPENAI_MODEL) {
    throw new Error('embedding custom host is not set.');
  }

  const client = new OpenAI({
    baseURL: config.EMBEDDING_OPENAI_BASEURL,
    apiKey: config.EMBEDDING_OPENAI_API_KEY ?? '',
  });

  const response = await client.embeddings.create({
    // https://huggingface.co/google/embeddinggemma-300m#prompt-instructions
    input: `task: search result | query: ${text}`,
    model: config.EMBEDDING_OPENAI_MODEL,
  });
  const embedding = response.data[0]?.embedding;
  if (!embedding) {
    throw new Error(`response is None. ${response}`);
  }
  return embedding;
};

const cleanEmbeddingInput = (text: string): string => {
  return text
    .split('\n')
    .filter(line => line.trim().length > 0 && !line.startsWith('#'))
    .join('\n');
};

export const searchMessage = async (
  guildId: string,
  keyword: string,
  channelId: string | null
) => {
  const client = getClient();
  const matchConditions = [
    {
      match: {
        guildId: guildId,
      },
    },
    {
      exists: { field: 'embeddingInput' },
    },
    {
      exists: { field: 'guildId' },
    },
    {
      exists: { field: 'channelId' },
    },
    {
      exists: { field: 'messageId' },
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ] as any[];
  if (channelId !== null) {
    matchConditions.push({
      match: {
        channelId: channelId,
      },
    });
  }

  const queryString = (() => {
    if (
      keyword.includes(' AND ') ||
      keyword.includes(' OR ') ||
      keyword.includes(' NOT ')
    ) {
      return keyword;
    }

    return keyword
      .split(' ')
      .filter(k => k.length > 0)
      .join(' AND ');
  })();
  logger.debug(`queryString: ${queryString}`);

  const result = await client.search({
    index: 'iconttv-discord-message_*',
    size: 10,
    _source: [
      '@timestamp',
      'guildId',
      'channelId',
      'messageId',
      'embeddingInput',
    ],
    query: {
      function_score: {
        query: {
          bool: {
            must: [
              ...matchConditions,
              {
                query_string: {
                  default_field: 'embeddingInput',
                  query: queryString,
                },
              },
            ],
          },
        },
        functions: [
          {
            gauss: {
              '@timestamp': {
                origin: 'now',
                scale: '30d', // 30일 이내는 점수가 1에 가깝게 증가
                decay: 0.5, // 시간이 30일 차이나면 점수가 반으로 감소
              },
            },
            weight: 20, // 가중치를 조절해서 날짜 점수 영향력 조절
          },
        ],
        score_mode: 'sum',
        boost_mode: 'sum',
      },
    },
    sort: [
      {
        _score: {
          order: 'desc',
        },
      },
    ],
  });

  const searchResult = result.hits.hits.map(hit => {
    logger.debug(`score: ${hit._score}`);
    const source = hit._source as {
      '@timestamp': string;
      guildId: string;
      channelId: string;
      messageId: string;
      message: string;
      embeddingInput: string;
      link: string;
    };
    source['@timestamp'] = new Date(source['@timestamp']).toLocaleString();
    source.link = getMessageLink(
      source.guildId,
      source.channelId,
      source.messageId
    );
    source.message = cleanEmbeddingInput(source.embeddingInput);

    return source;
  });

  return searchResult;
};

export const searchMessageEmbedding = async (
  guildId: string,
  searchWords: string,
  channelId: string | null
) => {
  const client = getClient();
  const matchConditions = [
    {
      match: {
        guildId: guildId,
      },
    },
    {
      exists: { field: 'embedding' },
    },
    {
      exists: { field: 'embeddingInput' },
    },
    {
      exists: { field: 'guildId' },
    },
    {
      exists: { field: 'channelId' },
    },
    {
      exists: { field: 'messageId' },
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ] as any[];
  if (channelId !== null) {
    matchConditions.push({
      match: {
        channelId: channelId,
      },
    });
  }
  const queryEmbedding = await getSearchQueryEmbedding(searchWords);
  logger.debug(`embedding created ${searchWords} ${queryEmbedding.length}`);

  const result = await client.search({
    index: 'iconttv-discord-message_*',
    size: 8,
    min_score: 0.44,
    _source: [
      '@timestamp',
      'guildId',
      'channelId',
      'messageId',
      'embeddingInput',
      'embedding',
    ],
    query: {
      script_score: {
        query: {
          bool: {
            must: matchConditions,
          },
        },
        script: {
          source: `
            double cosineSim = cosineSimilarity(params.query_vector, 'embedding') * 1.5 + 1.0;

            long timeMillis = doc['@timestamp'].value.toInstant().toEpochMilli();
            long nowMillis = params.now;
            double daysDiff = (nowMillis - timeMillis) / (1000.0 * 60.0 * 60.0 * 24.0);

            double datePenaltyFactor = -1.0;
            double datePenalty = 0.0;
            if (daysDiff > 30) {
              datePenalty = (daysDiff - 30) / 365.0;
            }

            double rawScore = cosineSim + (datePenalty * datePenaltyFactor);
            return Math.max(0.0, rawScore);
          `,
          params: {
            query_vector: queryEmbedding,
            now: Date.now(),
          },
        },
      },
    },
  });

  const searchResult = result.hits.hits.map(hit => {
    logger.debug(`score: ${hit._score}`);
    const source = hit._source as {
      '@timestamp': string;
      guildId: string;
      channelId: string;
      messageId: string;
      message: string;
      embeddingInput: string;
      link: string;
    };
    source['@timestamp'] = new Date(source['@timestamp']).toLocaleString();
    source.link = getMessageLink(
      source.guildId,
      source.channelId,
      source.messageId
    );
    source.message = cleanEmbeddingInput(source.embeddingInput);

    return source;
  });

  return searchResult;
};
