import assert from 'node:assert/strict';
import { test } from 'node:test';
import { config } from '../src/config';
import {
  getElasticClient,
  searchMessage,
  searchMessageEmbedding,
  MessageSearchBackendError,
} from '../src/service/elasticService';
import { aiClient } from '../src/service/embedding/client';
import type { estypes } from '@elastic/elasticsearch';

test('existing search functions retain legacy replies and expose the same scoring with scoped web paging', async t => {
  config.ELASTIC_HOST = 'http://127.0.0.1:9200';
  config.ELASTIC_API = 'test:test';
  const client = getElasticClient();
  t.after(() => client.close());
  const queries: estypes.SearchRequest[] = [];
  let backendError: Error | undefined;
  t.mock.method(client, 'search', async (query: estypes.SearchRequest) => {
    if (backendError) throw backendError;
    queries.push(query);
    return {
      _shards: { failed: 0 },
      hits: {
        total: { value: 1 },
        hits: [
          {
            _source: {
              '@timestamp': '2026-11-08T00:00:00.000Z',
              guildId: '100',
              channelId: '200',
              messageId: '300',
              embeddingInput: '# TEXT\nhello',
            },
          },
        ],
      },
    };
  });
  const embedding = t.mock.method(
    aiClient,
    'createEmbeddingText',
    async (input: string) => {
      assert.equal(
        input,
        'Instruct: Retrieve relevant messages that best matches the query\nhello'
      );
      return [0.1, 0.2];
    }
  );
  const legacy = await searchMessage('100', 'hello', null);
  assert.equal(legacy[0].message, 'hello');
  assert.equal(legacy[0].link, 'https://discord.com/channels/100/200/300');
  assert.equal(queries[0].size, 10);
  const raw = await searchMessage('100', 'hello', '200', {
    raw: true,
    allowedChannelIds: ['200'],
    offset: 25,
    limit: 26,
    sort: 'oldest',
    after: '2026-01-01',
  });
  assert.equal(
    raw.hits.hits[0]._source?.['@timestamp'],
    '2026-11-08T00:00:00.000Z'
  );
  assert.equal(queries[1].from, 25);
  assert.equal(queries[1].size, 26);
  assert.deepEqual(
    queries[0].query?.function_score?.functions,
    queries[1].query?.function_score?.functions
  );
  assert.match(JSON.stringify(queries[1]), /"@timestamp":"asc"/);
  assert.match(JSON.stringify(queries[1]), /2026-01-01T00:00:00.000Z/);
  await searchMessageEmbedding('100', 'hello', null);
  await searchMessageEmbedding('100', 'hello', '200', {
    raw: true,
    allowedChannelIds: ['200'],
    limit: 26,
    sort: 'newest',
  });
  assert.equal(embedding.mock.callCount(), 2);
  assert.equal(queries[2].size, 8);
  assert.equal(queries[2].min_score, 0.44);
  assert.equal(queries[3].min_score, 0.44);
  assert.equal(
    JSON.stringify(queries[2].query?.script_score?.script?.source),
    JSON.stringify(queries[3].query?.script_score?.script?.source)
  );
  assert.match(JSON.stringify(queries[3].sort), /"@timestamp":"desc"/);
  await assert.rejects(
    searchMessage('100', 'hello', '999', {
      raw: true,
      allowedChannelIds: ['200'],
    }),
    /scope/
  );
  backendError = new Error('backend unavailable');
  await assert.rejects(
    searchMessage('100', 'hello', null),
    error =>
      error instanceof MessageSearchBackendError && error.cause === backendError
  );
});
