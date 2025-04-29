import { Client } from '@elastic/elasticsearch';
import { config } from '../config';
import { getMessageLink } from '../utils/message';

// you should import fetch from 'node-fetch',
// else `fetch failed TypeError: fetch failed` occurs
import fetch from 'node-fetch';
import logger from '../lib/logger';

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

const getEmbedding = async (
  text: string,
  task: 'retrieval.query' | 'retrieval.passage' = 'retrieval.query'
) => {
  if (
    !config.EMBEDDING_CUSTOM_API_HOST ||
    config.EMBEDDING_CUSTOM_API_HOST.length === 0
  ) {
    throw new Error('embedding custom host is not set.');
  }

  const response = await fetch(config.EMBEDDING_CUSTOM_API_HOST, {
    method: 'POST',
    body: JSON.stringify({
      task,
      contents: [{ type: 'text', value: text }],
    }),
    headers: {
      'Content-Type': 'application/json',
      ...(config.EMBEDDING_CUSTOM_API_AUTH_HEADER
        ? { Authorization: config.EMBEDDING_CUSTOM_API_AUTH_HEADER }
        : {}),
    },
  });
  if (!response.ok) {
    const data = await response.text();
    throw new Error(data);
  }
  const data = await response.json();
  const { embedding } = data.results[0];
  return embedding as number[];
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
      exists: { field: 'message' },
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
    _source: ['@timestamp', 'guildId', 'channelId', 'messageId', 'message'],
    query: {
      function_score: {
        query: {
          bool: {
            must: [
              ...matchConditions,
              {
                query_string: {
                  default_field: 'message',
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

  logger.debug(result.hits.hits);

  const searchResult = result.hits.hits.map(hit => {
    const source = hit._source as {
      '@timestamp': string;
      guildId: string;
      channelId: string;
      messageId: string;
      message: string;
      link: string;
    };
    source['@timestamp'] = new Date(source['@timestamp']).toLocaleString();
    source.link = getMessageLink(
      source.guildId,
      source.channelId,
      source.messageId
    );

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
      exists: { field: 'content_text' },
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
  const queryEmbedding = await getEmbedding(searchWords);

  const result = await client.search({
    index: 'iconttv-discord-message-embedding_*',
    size: 8,
    min_score: 1.3,
    _source: [
      '@timestamp',
      'guildId',
      'channelId',
      'messageId',
      'chunkType',
      'content_text',
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
            double cosineSim = cosineSimilarity(params.query_vector, 'embedding') + 1.0;

            long timeMillis = doc['@timestamp'].value.toInstant().toEpochMilli();
            long nowMillis = params.now;
            double daysDiff = (nowMillis - timeMillis) / (1000.0 * 60.0 * 60.0 * 24.0);

            String chunkType = doc['chunkType'].value;
            double typeWeight = 0.0;
            if (chunkType != null && (chunkType == 'attachment_image' || chunkType == 'attachment_file')) {
              typeWeight = 0.1;
            }

            double datePenaltyFactor = -1.5;
            double datePenalty = 0.0;
            if (daysDiff > 30) {
              datePenalty = (daysDiff - 30) / 365.0;
            }

            return cosineSim + typeWeight + (datePenalty * datePenaltyFactor);
          `,
          params: {
            query_vector: queryEmbedding,
            now: Date.now(),
          },
        },
      },
    },
  });

  const chunkTypeStringMap = {
    message: '',
    attachment_image: '🖼️ ',
    attachment_file: '📁 ',
  };
  const searchResult = result.hits.hits.map(hit => {
    logger.debug(`score: ${hit._score}`);
    const source = hit._source as {
      '@timestamp': string;
      guildId: string;
      channelId: string;
      messageId: string;
      chunkType: 'message' | 'attachment_image' | 'attachment_file';
      content_text: string;
      message: string;
      link: string;
    };
    source['@timestamp'] = new Date(source['@timestamp']).toLocaleString();
    source.link = getMessageLink(
      source.guildId,
      source.channelId,
      source.messageId
    );
    source.message = `${chunkTypeStringMap[source.chunkType]} ${
      source.content_text
    }`;

    return source;
  });

  return searchResult;
};
