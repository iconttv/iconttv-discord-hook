import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const files = [
  'index.html',
  'app.js',
  'message-format.js',
  'message-images.js',
  'discord-links.js',
  'style.css',
  'favicon.svg',
];

export const createWebAssets = (directory: string) => {
  const load = async () => {
    const contents = new Map(
      await Promise.all(
        files.map(
          async file =>
            [file, await readFile(resolve(directory, file))] as const
        )
      )
    );
    const hash = createHash('sha256');
    for (const [file, content] of contents) hash.update(file).update(content);
    const version = hash.digest('hex').slice(0, 16);
    const html = contents
      .get('index.html')!
      .toString('utf8')
      .replace(
        /((?:src|href)=["'])\/(app\.js|style\.css|favicon\.svg)(["'])/g,
        `$1/assets/${version}/$2$3`
      );
    contents.set('index.html', Buffer.from(html));
    return { contents, version };
  };
  let pending: ReturnType<typeof load> | undefined;
  return async (path: string) => {
    const versioned = path.match(/^\/assets\/([a-f0-9]{16})\/([^/]+)$/);
    const file = ['/', '/search', '/settings'].includes(path)
      ? 'index.html'
      : (versioned?.[2] ?? path.slice(1));
    if (!files.includes(file)) return null;
    pending ??= load().catch(error => {
      pending = undefined;
      throw error;
    });
    const bundle = await pending;
    if (versioned && versioned[1] !== bundle.version) return null;
    const type = file.endsWith('.js')
      ? 'text/javascript'
      : file.endsWith('.css')
        ? 'text/css'
        : file.endsWith('.svg')
          ? 'image/svg+xml'
          : 'text/html';
    return {
      content: bundle.contents.get(file)!,
      type,
      version: bundle.version,
    };
  };
};
