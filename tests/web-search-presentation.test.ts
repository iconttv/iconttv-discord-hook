import assert from 'node:assert/strict';
import { test } from 'node:test';
import MessageModel from '../src/database/model/MessageModel';
import { config } from '../src/config';
import { getElasticClient } from '../src/service/elasticService';
import { searchWebMessages } from '../src/service/webSearchService';
import type { WebSearchOptions } from '../src/web/types';

test('search verifies archive deletion state and presents current edits/images in both backends', async t => {
  config.ELASTIC_HOST = 'http://127.0.0.1:9200';
  config.ELASTIC_API = 'test-id:test-key';
  const client = getElasticClient();
  t.after(() => client.close());
  let mode = 'elastic';
  let filter: Record<string, unknown> = {};
  let fields = '';
  const documents = [
    {
      channelId: '300',
      messageId: '1',
      senderId: '200',
      senderName: 'name',
      message: 'current content',
      createdAt: new Date('2026-11-08T10:00:00Z'),
      editedAt: new Date('2026-11-08T11:00:00Z'),
      attachments: [
        {
          name: 'image.png',
          url: 'https://cdn.discordapp.com/attachments/300/400/image.png',
        },
      ],
    },
    {
      channelId: '300',
      messageId: '2',
      isDeleted: true,
      message: 'deleted secret',
      createdAt: new Date(),
    },
    {
      channelId: '300',
      messageId: '4',
      senderId: '200',
      message: '',
      editedAt: new Date(),
      createdAt: new Date(),
      attachments: [],
      raw: {
        content: 'old raw',
        attachments: [
          {
            name: 'old.png',
            url: 'https://cdn.discordapp.com/attachments/300/400/old.png',
          },
        ],
      },
    },
  ];
  t.mock.method(client, 'search', async () => {
    if (mode === 'mongo')
      throw Object.assign(new Error('ES unavailable'), { statusCode: 503 });
    return {
      _shards: { failed: 0 },
      hits: {
        total: { value: 5 },
        hits: ['1', '2', '3', '4', 'private'].map(messageId => ({
          _source: {
            guildId: '100',
            channelId: messageId === 'private' ? '999' : '300',
            messageId,
            message: 'stale index text',
            embeddingInput: 'stale index text',
          },
        })),
      },
    };
  });
  t.mock.method(MessageModel, 'find', (query: Record<string, unknown>) => {
    filter = query;
    const chain = {
      select: (value: string) => {
        fields = value;
        return chain;
      },
      maxTimeMS: () => chain,
      sort: () => chain,
      skip: () => chain,
      limit: () => chain,
      lean: async () => {
        if (mode === 'verification-fails')
          throw new Error('archive lookup failed');
        return mode === 'mongo'
          ? documents.filter(message => !message.isDeleted)
          : documents;
      },
    };
    return chain;
  });
  t.mock.method(MessageModel, 'countDocuments', () => ({
    maxTimeMS: async () => 2,
  }));
  const scope = {
    guildId: '100',
    channels: [{ id: '300', name: 'allowed', category: '' }],
  };
  const options: WebSearchOptions = {
    keyword: '',
    mode: 'text',
    sort: 'newest',
    page: 1,
  };
  const elastic = await searchWebMessages(scope, options);
  assert.deepEqual(
    elastic.messages.map(message => message.id),
    ['1', '4']
  );
  assert.equal(elastic.messages[0].content, 'current content');
  assert.ok(elastic.messages.every(message => !('avatarUrl' in message)));
  assert.equal(elastic.messages[0].editedTimestamp, '2026-11-08T11:00:00.000Z');
  assert.equal(elastic.messages[0].images?.length, 1);
  assert.equal(elastic.messages[1].content, '');
  assert.deepEqual(elastic.messages[1].images, []);
  assert.equal(filter.guildId, '100');
  assert.deepEqual(filter.isDeleted, { $ne: true });
  assert.doesNotMatch(JSON.stringify(filter), /999/);
  assert.match(fields, /editedAt/);
  assert.match(fields, /attachments/);
  mode = 'verification-fails';
  await assert.rejects(
    searchWebMessages(scope, options),
    /archive lookup failed/
  );
  mode = 'mongo';
  const mongo = await searchWebMessages(scope, options);
  assert.equal(mongo.source, 'mongodb');
  assert.ok(mongo.messages.every(message => !('avatarUrl' in message)));
  assert.deepEqual(
    mongo.messages.map(message => message.id),
    ['1', '4']
  );
  assert.equal(
    mongo.messages[0].editedTimestamp,
    elastic.messages[0].editedTimestamp
  );
  assert.deepEqual(mongo.messages[0].images, elastic.messages[0].images);
  assert.equal(mongo.messages[1].content, '');
  assert.deepEqual(filter.channelId, { $in: ['300'] });
  assert.deepEqual(filter.isDeleted, { $ne: true });
});
