import { Client } from '@elastic/elasticsearch';
import { config } from '../config';
import { getMessageLink } from '../utils/message';

let _client: Client;

const getClient = () => {
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

export const searchMessage = async (
  guildId: string,
  keyword: string,
  channelId: string | null
) => {
  const client = getClient();
  const matchConditions = channelId
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
