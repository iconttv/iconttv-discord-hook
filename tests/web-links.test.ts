import assert from 'node:assert/strict';
import { test } from 'node:test';
import { discordTargets, openDiscordLink } from '../web/discord-links.js';

const url = 'https://discord.com/channels/100/200/300';

test('Discord links target desktop/iOS apps and Android with an explicit web fallback', () => {
  assert.equal(
    discordTargets(url, 'Windows').app,
    'discord://-/channels/100/200/300'
  );
  assert.equal(
    discordTargets(url, 'iPhone').app,
    'discord://-/channels/100/200/300'
  );
  const android = discordTargets(url, 'Android').app;
  assert.match(android, /package=com\.discord;/);
  assert.ok(
    android.includes(`S.browser_fallback_url=${encodeURIComponent(url)};`)
  );
  for (const invalid of [
    'javascript:alert(1)',
    'https://discord.com.evil.test/channels/100',
    'https://discord.com/api/webhooks/100/token',
    url + '?token=secret',
  ]) {
    assert.equal(discordTargets(invalid, 'Windows'), null);
  }
});

test('web fallback runs only while the browser remains active; app/prompt transition cancels it', () => {
  for (const action of ['timeout', 'hidden', 'blur', 'pagehide', 'cancel']) {
    const destinations: string[] = [];
    const doc = Object.assign(new EventTarget(), { hidden: false });
    let timer: (() => void) | undefined;
    const runtime = Object.assign(new EventTarget(), {
      document: doc,
      navigator: { userAgent: 'Windows' },
      location: {
        assign: (value: string) => {
          destinations.push(value);
        },
      },
      setTimeout: (callback: () => void) => {
        timer = callback;
        return 1;
      },
      clearTimeout: () => {
        timer = undefined;
      },
    });
    const cancel = openDiscordLink(url, runtime);
    if (action === 'hidden') {
      doc.hidden = true;
      doc.dispatchEvent(new Event('visibilitychange'));
    } else if (action === 'blur' || action === 'pagehide')
      runtime.dispatchEvent(new Event(action));
    else if (action === 'cancel') cancel();
    timer?.();
    assert.deepEqual(
      destinations,
      action === 'timeout'
        ? ['discord://-/channels/100/200/300', url]
        : ['discord://-/channels/100/200/300'],
      action
    );
  }
});
