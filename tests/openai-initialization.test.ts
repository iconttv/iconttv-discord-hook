import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

test('CLI help works without AI configuration; missing credentials fail only when used', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'iconttv-no-ai-'));
  const root = path.resolve(__dirname, '..');
  try {
    cpSync(path.join(root, 'src'), path.join(directory, 'src'), { recursive: true });
    cpSync(path.join(root, 'tsconfig.json'), path.join(directory, 'tsconfig.json'));
    symlinkSync(path.join(root, 'node_modules'), path.join(directory, 'node_modules'));
    const env = { ...process.env, NODE_ENV: 'dev' };
    for (const key of Object.keys(env)) {
      if (/OPENAI|OPENROUTER|NODE_OPTIONS/.test(key)) delete env[key];
    }
    const help = spawnSync(process.execPath, ['--import', 'tsx', 'src/cli.ts', '--help'], {
      cwd: directory,
      env,
      encoding: 'utf8',
      timeout: 15000,
    });
    assert.equal(help.status, 0, help.stderr);
    assert.match(help.stdout, /llm-question/);
    assert.match(help.stdout, /embedding/);
    assert.match(help.stdout, /backfill/);

    const use = spawnSync(process.execPath, ['--import', 'tsx', '--eval', `
      const assert = require('node:assert/strict');
      const { aiClient } = require('./src/service/embedding/client.ts');
      globalThis.fetch = async () => { throw new Error('unexpected network request'); };
      (async () => {
        await assert.rejects(aiClient.createEmbeddingText('text'), /Missing credentials/);
        await assert.rejects(aiClient._summarizeText('text'), /Missing credentials/);
      })().catch(error => { console.error(error); process.exitCode = 1; });
    `], {
      cwd: directory,
      env,
      encoding: 'utf8',
      timeout: 15000,
    });
    assert.equal(use.status, 0, use.stderr);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
