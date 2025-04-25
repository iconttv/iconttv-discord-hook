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

const getEmbedding = async (text: string) => {
  if (
    !config.EMBEDDING_CUSTOM_API_HOST ||
    config.EMBEDDING_CUSTOM_API_HOST.length === 0
  ) {
    throw new Error('embedding custom host is not set.');
  }

  const response = await fetch(config.EMBEDDING_CUSTOM_API_HOST, {
    method: 'POST',
    body: JSON.stringify({
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
  const matchConditions =
    channelId !== null
      ? [
          {
            match: {
              guildId: guildId,
            },
          },
          {
            match: {
              channelId: channelId,
            },
          },
        ]
      : [
          {
            match: {
              guildId: guildId,
            },
          },
        ];

  const result = await client.search({
    index: 'iconttv-discord-message_*',
    size: 10,
    _source: ['@timestamp', 'guildId', 'channelId', 'messageId', 'message'],
    query: {
      bool: {
        must: [
          ...matchConditions,
          {
            fuzzy: {
              message: {
                value: keyword,
              },
            },
          },
        ],
      },
    },
    sort: [
      {
        '@timestamp': {
          order: 'desc',
        },
      },
    ],
  });

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
  const matchConditions =
    channelId !== null
      ? [
          {
            match: {
              guildId: guildId,
            },
          },
          {
            match: {
              channelId: channelId,
            },
          },
        ]
      : [
          {
            match: {
              guildId: guildId,
            },
          },
        ];
  const queryEmbedding = await getEmbedding(searchWords);

  const result = await client.search({
    index: 'iconttv-discord-message-embedding_*',
    size: 10,
    min_score: 1.5,
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
            must: [...matchConditions, { match_all: {} }],
          },
        },
        script: {
          source: "cosineSimilarity(params.embedding, 'embedding') + 1.0",
          params: { embedding: queryEmbedding },
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
