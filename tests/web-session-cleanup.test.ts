import assert from 'node:assert/strict';
import { setImmediate as nextTurn } from 'node:timers/promises';
import { test } from 'node:test';
import WebSessionModel, {
  WEB_SESSION_RETENTION_SECONDS,
} from '../src/database/model/WebSessionModel';
import { createWebSession } from '../src/service/webSessionService';
import { ensureWebSessionRetention } from '../src/service/webSessionCleanupService';
import { verifySessionToken } from '../src/web/sessionToken';
import { config } from '../src/config';
import logger from '../src/lib/logger';

test('session cleanup retains 30 days after expiry, migrates old TTL and never delays issued links', async t => {
  const original = { ...config };
  const originalDb = WebSessionModel.db.db;
  const commands: unknown[] = [];
  const cutoffs: number[] = [];
  const warnings: unknown[] = [];
  const cleanups: { resolve: () => void; reject: (error: Error) => void }[] =
    [];
  let finishIndex: () => void = () => {};
  let denied = true;
  let indexCalls = 0;
  t.after(() => {
    finishIndex();
    cleanups.forEach(cleanup => cleanup.resolve());
    Object.assign(config, original);
    WebSessionModel.db.db = originalDb;
  });
  t.mock.method(logger, 'warn', (message: unknown) => {
    warnings.push(message);
  });
  t.mock.method(
    WebSessionModel.collection,
    'createIndex',
    async (_key: unknown, options: { expireAfterSeconds: number }) => {
      indexCalls++;
      assert.equal(options.expireAfterSeconds, 30 * 86400);
      throw Object.assign(new Error('synthetic index error'), {
        code: denied ? 13 : 85,
      });
    }
  );
  WebSessionModel.db.db = {
    command: async (command: unknown) => {
      commands.push(command);
      await new Promise<void>(resolve => {
        finishIndex = resolve;
      });
    },
  } as unknown as typeof originalDb;
  t.mock.method(WebSessionModel, 'create', async () => ({}));
  t.mock.method(
    WebSessionModel,
    'deleteMany',
    (filter: { expiresAt: { $lt: Date } }) => {
      cutoffs.push(filter.expiresAt.$lt.getTime());
      return {
        maxTimeMS: () => ({
          exec: () =>
            new Promise<void>((resolve, reject) =>
              cleanups.push({ resolve, reject })
            ),
        }),
      };
    }
  );
  await assert.rejects(ensureWebSessionRetention(), /synthetic/);
  denied = false;
  const secret = 'cleanup-test-only-01234567890123456789';
  Object.assign(config, {
    WEB_PUBLIC_URL: 'https://web.example',
    WEB_SESSION_SECRET: secret,
    WEB_SESSION_TTL_SECONDS: '1800',
  });
  const identity = {
    userId: '200',
    displayName: 'user',
    avatarUrl: '',
    guildId: '100',
    guildName: 'guild',
    guildIconUrl: '',
    channels: [],
    permissions: '0',
  };
  const before = Date.now();
  let delivered = false;
  const issue = createWebSession(identity).then(result => {
    delivered = true;
    return result;
  });
  await nextTurn();
  assert.equal(
    delivered,
    true,
    'cleanup or index migration must not block token delivery'
  );
  const issued = await issue;
  await createWebSession(identity);
  await nextTurn();
  assert.equal(
    indexCalls,
    2,
    'failed setup is retried once and concurrent callers share it'
  );
  assert.equal(cleanups.length, 2, 'each issued link starts a cleanup');
  for (const cutoff of cutoffs) {
    assert.ok(cutoff >= before - WEB_SESSION_RETENTION_SECONDS * 1000);
    assert.ok(cutoff <= Date.now() - WEB_SESSION_RETENTION_SECONDS * 1000);
  }
  assert.deepEqual(commands, [
    {
      collMod: WebSessionModel.collection.name,
      index: { name: 'expiresAt_1', expireAfterSeconds: 2592000 },
    },
  ]);
  assert.ok(
    verifySessionToken(issued.token, secret, issued.expiresAt.getTime() - 1)
  );
  assert.equal(
    verifySessionToken(issued.token, secret, issued.expiresAt.getTime()),
    null
  );
  cleanups[0].reject(new Error('synthetic cleanup failure'));
  cleanups[1].resolve();
  finishIndex();
  await ensureWebSessionRetention();
  await nextTurn();
  assert.equal(
    warnings.length,
    1,
    'background failures are handled and logged'
  );
});
