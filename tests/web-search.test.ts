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
  assert.match(
    JSON.stringify(scoped.query),
    /"term":\{"channelId":"allowed"\}/
  );
  assert.doesNotMatch(
    JSON.stringify(buildWebSearchQuery(session, base).query),
    /embeddingInput/
  );
});

test('semantic search preserves legacy scoring and its floor with paging and every sort order', () => {
  const scope = {
    guildId: '100',
    channels: [{ id: '200', name: 'allowed', category: '' }],
  };
  const options: WebSearchOptions = {
    keyword: 'meaning',
    mode: 'semantic',
    sort: 'relevance',
    page: 2,
  };
  for (const sort of ['relevance', 'newest', 'oldest'] as const) {
    const query = buildWebSearchQuery(scope, { ...options, sort }, [0.1, 0.2]);
    assert.equal(query.min_score, 0.44);
    assert.equal(query.track_total_hits, true);
    assert.equal(query.from, 25);
    assert.match(
      JSON.stringify(query.query),
      /cosineSimilarity.*\* 1\.5 \+ 1\.0/
    );
    assert.match(JSON.stringify(query.query), /daysDiff > 30/);
    assert.match(JSON.stringify(query.query), /365\.0/);
    assert.match(JSON.stringify(query.query), /cosineSim - datePenalty/);
  }
  for (const keyword of ['', 'literal'])
    assert.equal(
      buildWebSearchQuery(scope, { ...options, mode: 'text', keyword })
        .min_score,
      undefined
    );
});

test('text search preserves legacy Boolean keywords and recency weighting independently of sort order', () => {
  const scope = {
    guildId: '100',
    channels: [{ id: '200', name: 'allowed', category: '' }],
  };
  for (const sort of ['relevance', 'newest', 'oldest'] as const) {
    const query = buildWebSearchQuery(scope, {
      keyword: 'alpha beta',
      mode: 'text',
      sort,
      page: 1,
    });
    const body = JSON.stringify(query.query);
    assert.match(body, /alpha AND beta/);
    assert.match(body, /"scale":"30d","decay":0.5/);
    assert.match(body, /"weight":20/);
    assert.match(body, /"boost_mode":"sum"/);
    assert.equal(
      JSON.stringify(query.sort).includes('"_score"'),
      sort === 'relevance'
    );
    if (sort === 'oldest')
      assert.match(JSON.stringify(query.sort), /"@timestamp":"asc"/);
  }
  const or = buildWebSearchQuery(scope, {
    keyword: 'alpha OR beta',
    mode: 'text',
    sort: 'relevance',
    page: 1,
  });
  assert.match(JSON.stringify(or.query), /alpha OR beta/);
  const latest = buildWebSearchQuery(scope, {
    keyword: '',
    mode: 'text',
    sort: 'newest',
    page: 1,
  });
  assert.doesNotMatch(
    JSON.stringify(latest.query),
    /function_score|query_string|embedding/
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
