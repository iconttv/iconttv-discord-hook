import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BackendUnavailable, CircuitBreaker } from '../src/web/circuitBreaker';
import {
  buildWebSearchQuery,
  buildMongoSearchFilter,
} from '../src/web/searchQuery';
import type { WebSession, WebSearchOptions } from '../src/web/types';

test('all Elasticsearch query modes enforce guild and readable channel filters', () => {
  const session = {
    guildId: 'guild',
    channels: [{ id: 'allowed' }, { id: 'second' }],
  } as WebSession;
  const base: WebSearchOptions = {
    keyword: '',
    mode: 'text',
    sort: 'newest',
    page: 1,
  };
  for (const options of [
    base,
    { ...base, keyword: 'message', sort: 'relevance' as const },
    { ...base, keyword: 'meaning', mode: 'semantic' as const },
  ]) {
    const query = buildWebSearchQuery(session, options, [0.1, 0.2]);
    const text = JSON.stringify(query.query);
    assert.match(text, /"term":\{"guildId":"guild"\}/);
    assert.match(text, /"terms":\{"channelId":\["allowed","second"\]\}/);
    assert.match(text, /"must_not":\[\{"term":\{"isDeleted":true\}\}\]/);
  }
  assert.throws(() =>
    buildWebSearchQuery(session, { ...base, channelId: 'private' })
  );
  const empty = buildWebSearchQuery({ ...session, channels: [] }, base);
  assert.match(JSON.stringify(empty.query), /"channelId":\[\]/);
  const scoped = buildWebSearchQuery(session, {
    ...base,
    channelId: 'allowed',
    page: 2,
  });
  assert.equal(scoped.from, 25);
  assert.match(JSON.stringify(scoped.query), /"channelId":\["allowed"\]/);
  assert.doesNotMatch(
    JSON.stringify(buildWebSearchQuery(session, base).query),
    /embeddingInput/
  );
});

test('Mongo fallback keeps the same scope and treats regex syntax as literal text', () => {
  const session = {
    guildId: 'guild',
    channels: [{ id: 'allowed' }],
  } as WebSession;
  const options: WebSearchOptions = {
    keyword: 'a.* [x]',
    mode: 'text',
    sort: 'newest',
    page: 1,
  };
  const filter = buildMongoSearchFilter(session, options);
  assert.equal(filter.guildId, 'guild');
  assert.deepEqual(filter.channelId, { $in: ['allowed'] });
  assert.deepEqual(filter.isDeleted, { $ne: true });
  assert.equal(filter.$and?.[0].$or[0].message?.$regex, 'a\\.\\*');
  assert.equal(filter.$and?.[1].$or[0].message?.$regex, '\\[x\\]');
  assert.throws(() =>
    buildMongoSearchFilter(session, { ...options, channelId: 'private' })
  );
  assert.deepEqual(
    buildMongoSearchFilter({ ...session, channels: [] }, options).channelId,
    { $in: [] }
  );
  assert.equal(
    buildMongoSearchFilter(session, { ...options, keyword: '' }).$and,
    undefined
  );
});

test('three consecutive failures open circuit; cooldown allows exactly one recovery probe', async () => {
  let now = 0;
  let primaryCalls = 0;
  let fallbackCalls = 0;
  const breaker = new CircuitBreaker(3, 30000, () => now);
  const down = async () => {
    primaryCalls++;
    throw new BackendUnavailable();
  };
  const fallback = async () => {
    fallbackCalls++;
    return 'mongo';
  };
  for (let i = 0; i < 4; i++)
    assert.equal(await breaker.run(down, fallback), 'mongo');
  assert.equal(primaryCalls, 3);
  assert.equal(fallbackCalls, 4);
  now = 30001;
  let release!: (value: string) => void;
  const probe = breaker.run(
    () =>
      new Promise<string>(resolve => {
        primaryCalls++;
        release = resolve;
      }),
    fallback
  );
  assert.equal(await breaker.run(down, fallback), 'mongo');
  assert.equal(primaryCalls, 4);
  release('elastic');
  assert.equal(await probe, 'elastic');
  assert.equal(await breaker.run(async () => 'healthy', fallback), 'healthy');
  await assert.rejects(
    () =>
      breaker.run(async () => {
        throw new Error('bad query');
      }, fallback),
    /bad query/
  );
});
