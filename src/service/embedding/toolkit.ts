import {
  NodeHtmlMarkdown,
  type NodeHtmlMarkdownOptions,
} from 'node-html-markdown';
import { config } from '../../config';
import logger from '../../lib/logger';

export function isUrl(url: string) {
  return url.startsWith('http://') || url.startsWith('https://');
}

export async function isLiveUrl(url: string) {
  try {
    const res = await fetch(url, {
      method: 'HEAD', // 본문을 요청하지 않음
      cache: 'no-store', // 캐시 우회 (원하면 변경)
      redirect: 'follow',
      signal: AbortSignal.timeout(5000),
    });
    return res.status < 400; // 상태코드만 반환
  } catch (err) {
    logger.error(`${url}\n${err}`);
    return false;
  }
}

export function replaceDiscordEmoji(text: string): string {
  // 1) ID 제거: <:name:1234> 또는 <a:name:1234> -> <:name:> 또는 <a:name:>
  const removedIds = text.replace(/<(a:|:)([A-Za-z0-9_]+):\d+>/g, '<$1$2:>');

  // 2) 연속된 동일 이모지 묶음 축약: (<:name:>)(<:name:>)* -> <:name:>
  // 공백이 섞여 있어도 묶음으로 취급하려면 \s* 포함
  const collapsed = removedIds.replace(
    /(<(?:a:|:)[A-Za-z0-9_]+:>)(?:\s*\1)+/g,
    '$1'
  );

  return collapsed;
}

export function readBase64Image(base64: string): [string, ArrayBuffer] {
  // Helper: decode base64 payload to ArrayBuffer using Node Buffer
  function base64ToArrayBuffer(b64: string): ArrayBuffer {
    const buf = Buffer.from(b64, 'base64');
    // Return a copy-backed ArrayBuffer view of the Buffer contents
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  }

  if (base64.startsWith('data:image')) {
    const commaIndex = base64.indexOf(',');
    if (commaIndex === -1) {
      throw new Error('Invalid data URL: missing comma');
    }

    const header = base64.substring(5, commaIndex); // skip "data:"
    const headerParts = header.split(';');
    const contentType = headerParts[0] || 'image/png';

    // Require base64 token for image data URLs (most image data URLs use base64)
    if (!headerParts.includes('base64')) {
      throw new Error(
        'Unsupported data URL encoding: expected ";base64" for image data'
      );
    }

    const payload = base64.substring(commaIndex + 1);
    const arrayBuffer = base64ToArrayBuffer(payload);
    return [contentType, arrayBuffer];
  }

  // Not a data URL: treat as raw base64 and return image/png per your comment
  const arrayBuffer = base64ToArrayBuffer(base64);
  return ['image/png', arrayBuffer];
}

export async function readUrl(url: string) {
  if (!config.JINA_READER_API_KEY) {
    return await _readUrlDirectly(url);
  }

  try {
    return await _readUrlJina(url);
  } catch (e) {
    logger.error(e);
    return await _readUrlDirectly(url);
  }
}

export async function readImage(url: string): Promise<[string, ArrayBuffer]> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(await response.text());
  }
  const contentType = response.headers.get('content-type');
  if (!contentType || !contentType.startsWith('image/')) {
    throw new Error(
      `URL does not point to an image. ${url} Content-Type: ${contentType}`
    );
  }

  return [contentType, await response.arrayBuffer()];
}

async function _readUrlJina(url: string): Promise<string> {
  const response = await fetch(`https://r.jina.ai/${url}`, {
    headers: {
      Authorization: `Bearer ${config.JINA_READER_API_KEY}`,
      DNT: '1',
      'X-Locale': 'ko-KR',
      'X-Retain-Images': 'none',
      'X-Timeout': '10',
      'X-Token-Budget': '200000',
      'X-With-Generated-Alt': 'true',
    },
    signal: AbortSignal.timeout(20000),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(text);
  }
  return text;
}

const _markdownOptions: Partial<NodeHtmlMarkdownOptions> = {
  keepDataImages: false,
  useInlineLinks: true,
  useLinkReferenceDefinitions: true,
};

async function _readUrlDirectly(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Whale/4.33.325.17 Safari/537.36',
    },
    signal: AbortSignal.timeout(20000),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(text);
  }
  return NodeHtmlMarkdown.translate(text, _markdownOptions);
}
