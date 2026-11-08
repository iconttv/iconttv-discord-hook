import { cp, mkdtemp, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
const temporary = await mkdtemp(join(tmpdir(), 'iconttv-web-test-'));
try {
  for (const directory of ['src', 'web', 'tests'])
    await cp(join(root, directory), join(temporary, directory), {
      recursive: true,
    });
  await cp(join(root, 'tsconfig.json'), join(temporary, 'tsconfig.json'));
  await symlink(
    join(root, 'node_modules'),
    join(temporary, 'node_modules'),
    'dir'
  );
  const result = spawnSync(
    process.execPath,
    [
      '--import',
      'tsx',
      '--test',
      'tests/web.test.ts',
      'tests/web-channels.test.ts',
      'tests/web-search.test.ts',
      'tests/web-presentation.test.ts',
      'tests/web-avatars.test.ts',
      'tests/web-avatar-api.test.ts',
      'tests/elastic-search.test.ts',
      'tests/web-health.test.ts',
      'tests/web-command-fallback.test.ts',
      'tests/web-links.test.ts',
      'tests/web-security.test.ts',
      'tests/web-search-presentation.test.ts',
      'tests/web-session-cleanup.test.ts',
      'tests/web-session-access.test.ts',
      'tests/web-assets.test.ts',
    ],
    {
      cwd: temporary,
      stdio: 'inherit',
      env: { PATH: process.env.PATH, NODE_ENV: 'test', TZ: 'UTC' },
    }
  );
  process.exitCode = result.status ?? 1;
} finally {
  await rm(temporary, { recursive: true, force: true });
}
