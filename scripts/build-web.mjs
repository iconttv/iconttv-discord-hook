import { cp, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const output = fileURLToPath(new URL('../dist/public/', import.meta.url));
await mkdir(output, { recursive: true });
for (const file of [
  'index.html',
  'app.js',
  'message-format.js',
  'message-images.js',
  'discord-links.js',
  'style.css',
  'favicon.svg',
]) {
  await cp(new URL(`../web/${file}`, import.meta.url), `${output}/${file}`);
}
