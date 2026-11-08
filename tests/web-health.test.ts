import assert from 'node:assert/strict';
import { test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { WebHealthProbe } from '../src/web/health';

test('health caches both outcomes for five seconds and shares concurrent probes', async () => {
  let now = 0;
  let calls = 0;
  let available = true;
  let release: (() => void) | undefined;
  const probe = new WebHealthProbe('https://web.example:3011', {
    now: () => now,
    fetch: async (url, options) => {
      calls++;
      assert.equal(String(url), 'https://web.example:3011/health');
      assert.equal(options?.redirect, 'error');
      assert.equal(options?.cache, 'no-store');
      await new Promise<void>(resolve => {
        release = resolve;
      });
      return available
        ? Response.json({ status: 'ok', service: 'iconttv-discord-web' })
        : new Response('', { status: 503 });
    },
  });
  const first = probe.check();
  const second = probe.check();
  assert.equal(calls, 1);
  release!();
  assert.deepEqual(await Promise.all([first, second]), [true, true]);
  available = false;
  now = 4999;
  assert.equal(await probe.check(), true);
  assert.equal(calls, 1);
  now = 5000;
  const failed = probe.check();
  release!();
  assert.equal(await failed, false);
  assert.equal(calls, 2);
  available = true;
  now = 9999;
  assert.equal(await probe.check(), false);
  assert.equal(calls, 2);
  now = 10000;
  const recovered = probe.check();
  release!();
  assert.equal(await recovered, true);
  assert.equal(calls, 3);
});

test('health fails closed for invalid responses, transport errors and timeouts', async () => {
  for (const response of [
    Response.json({ status: 'ok' }),
    new Response('<html>login</html>'),
    new Response('', { status: 302 }),
  ]) {
    assert.equal(
      await new WebHealthProbe('https://web.example', {
        fetch: async () => response,
      }).check(),
      false
    );
  }
  assert.equal(
    await new WebHealthProbe('https://web.example', {
      fetch: async () => {
        throw new Error('connection refused');
      },
    }).check(),
    false
  );
  const timeout = new WebHealthProbe('https://web.example', {
    timeoutMs: 10,
    fetch: async (_url, options) => {
      await delay(100, undefined, { signal: options!.signal! });
      throw new Error('timeout did not abort');
    },
  });
  assert.equal(await timeout.check(), false);
});
