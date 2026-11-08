import assert from 'node:assert/strict';
import { cp, mkdtemp, appendFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { createWebAssets } from '../src/web/assets';

test('HTML, stylesheet and every JS module share a content version that changes on deployment', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'web-assets-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await cp(resolve('web'), directory, { recursive: true });
  const assets = createWebAssets(directory);
  const shell = await assets('/search');
  assert(shell);
  const html = shell.content.toString();
  for (const file of ['app.js', 'style.css', 'favicon.svg']) {
    assert.ok(html.includes(`/assets/${shell.version}/${file}`));
    assert.equal(
      (await assets(`/assets/${shell.version}/${file}`))?.version,
      shell.version
    );
  }
  const app = await assets(`/assets/${shell.version}/app.js`);
  assert(app);
  for (const match of app.content
    .toString()
    .matchAll(/from ['"]\.\/([^'"]+)['"]/g)) {
    const imported = await assets(`/assets/${shell.version}/${match[1]}`);
    assert.equal(imported?.version, shell.version);
    assert.ok(
      html.includes(
        `rel="modulepreload" href="/assets/${shell.version}/${match[1]}"`
      )
    );
  }
  assert.match(
    html,
    /<script data-cfasync="false" type="module" src="\/assets\//
  );
  assert.equal(await assets('/assets/0000000000000000/app.js'), null);
  assert.equal(await assets('/assets/' + shell.version + '/../../.env'), null);
  assert.equal(await assets('/anything/app.js'), null);
  await appendFile(join(directory, 'style.css'), '\n/* next deployment */');
  const updated = createWebAssets(directory);
  const nextShell = await updated('/search');
  assert(nextShell);
  assert.notEqual(nextShell.version, shell.version);
  assert.equal(await updated(`/assets/${shell.version}/app.js`), null);
});
