import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { createWebAssets } from './assets';
import type {
  WebSearchOptions,
  WebSearchResult,
  WebSession,
  WebSettings,
  WebMessageReference,
} from './types';
import { getWebCapabilities } from './permissions';
import { SemanticSearchUnavailable } from './circuitBreaker';

export interface WebDependencies {
  origin: string;
  assets: string;
  isHealthy?(): boolean;
  findSession(token: string): Promise<WebSession | null>;
  search(
    session: WebSession,
    options: WebSearchOptions
  ): Promise<WebSearchResult>;
  avatars?(
    session: WebSession,
    references: WebMessageReference[]
  ): Promise<Record<string, string>>;
  getSettings(guildId: string): Promise<WebSettings>;
  saveSettings(
    guildId: string,
    actorId: string,
    settings: WebSettings
  ): Promise<void>;
  onError(error: unknown): void;
}

class HttpError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
  }
}

const json = (response: ServerResponse, status: number, body: unknown) => {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
  });
  response.end(JSON.stringify(body));
};

const readJson = async (
  request: IncomingMessage
): Promise<Record<string, unknown>> => {
  if (request.headers['content-type']?.split(';')[0] !== 'application/json')
    throw new HttpError(415, 'JSON 요청이 필요합니다.');
  let data = '';
  for await (const chunk of request) {
    data += chunk.toString();
    if (Buffer.byteLength(data) > 8192)
      throw new HttpError(413, '요청이 너무 큽니다.');
  }
  try {
    const value = JSON.parse(data);
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw new Error();
    return value;
  } catch {
    throw new HttpError(400, '요청 형식을 확인해 주세요.');
  }
};

const readOptions = (
  params: URLSearchParams,
  session: WebSession
): WebSearchOptions => {
  const keyword = params.get('keyword')?.trim() ?? '';
  const allChannels = params.get('allChannels') ?? 'false';
  if (!['true', 'false'].includes(allChannels))
    throw new HttpError(400, '검색 범위를 확인해 주세요.');
  const channelId =
    params.get('channelId') ||
    (allChannels === 'true'
      ? undefined
      : session.initialChannelId || session.channels[0]?.id);
  const embedding = params.get('embedding') ?? 'false';
  const mode = keyword && embedding === 'true' ? 'semantic' : 'text';
  const sort = keyword ? (params.get('sort') ?? 'relevance') : 'newest';
  const page = Number(params.get('page') ?? '1');
  const after = params.get('after') || undefined;
  const before = params.get('before') || undefined;
  if (keyword.length > 200)
    throw new HttpError(400, '검색어는 200자 이내로 입력해 주세요.');
  if (channelId && !session.channels.some(channel => channel.id === channelId))
    throw new HttpError(403, '검색할 수 없는 채널입니다.');
  if (embedding !== 'true' && embedding !== 'false')
    throw new HttpError(400, '검색 방식을 확인해 주세요.');
  if (!['relevance', 'newest', 'oldest'].includes(sort))
    throw new HttpError(400, '정렬 방식을 확인해 주세요.');
  if (!Number.isInteger(page) || page < 1 || page > 100)
    throw new HttpError(
      400,
      '검색 범위를 좁혀 주세요. 최대 100페이지까지 볼 수 있습니다.'
    );
  for (const date of [after, before]) {
    if (
      date &&
      (!/^\d{4}-\d{2}-\d{2}$/.test(date) ||
        !Number.isFinite(Date.parse(date)) ||
        new Date(date).toISOString().slice(0, 10) !== date)
    ) {
      throw new HttpError(400, '날짜를 확인해 주세요.');
    }
  }
  if (after && before && after > before)
    throw new HttpError(400, '시작일은 종료일보다 늦을 수 없습니다.');
  return {
    keyword,
    channelId,
    mode,
    sort: sort as WebSearchOptions['sort'],
    page,
    after,
    before,
  };
};

const readSettings = (body: Record<string, unknown>): WebSettings => {
  const keys = [
    'enableFeatureIconImageResize',
    'enableCommandQuestionForEveryone',
  ];
  if (
    Object.keys(body).length !== 2 ||
    !keys.every(key => typeof body[key] === 'boolean')
  ) {
    throw new HttpError(400, '설정 값을 확인해 주세요.');
  }
  return body as unknown as WebSettings;
};

const readAvatarReferences = (
  body: Record<string, unknown>,
  session: WebSession
): WebMessageReference[] => {
  if (
    Object.keys(body).length !== 1 ||
    !Array.isArray(body.messages) ||
    body.messages.length > 25
  )
    throw new HttpError(400, '아바타 요청 형식을 확인해 주세요.');
  return body.messages.map(value => {
    if (
      !value ||
      typeof value !== 'object' ||
      Object.keys(value).length !== 2 ||
      typeof value.id !== 'string' ||
      !/^\d{1,20}$/.test(value.id) ||
      typeof value.channelId !== 'string' ||
      !/^\d{1,20}$/.test(value.channelId)
    )
      throw new HttpError(400, '메시지 정보를 확인해 주세요.');
    if (!session.channels.some(channel => channel.id === value.channelId))
      throw new HttpError(403, '조회할 수 없는 채널입니다.');
    return { id: value.id, channelId: value.channelId };
  });
};

export const createWebServer = (dependencies: WebDependencies) => {
  const getAsset = createWebAssets(dependencies.assets);
  const secure = new URL(dependencies.origin).protocol === 'https:';
  const cookie = (token: string, age: number) =>
    `itv_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${age}${secure ? '; Secure' : ''}`;
  // Share limits across a user's links in the same guild, so issuing another
  // session cannot reset the search budget. Bound the map independently.
  const requests = new Map<
    string,
    { start: number; count: number; active: number }
  >();
  const server = createServer(async (request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('CDN-Cache-Control', 'no-store');
    response.setHeader('Cloudflare-CDN-Cache-Control', 'no-store');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('X-Frame-Options', 'DENY');
    response.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' https://cdn.discordapp.com https://media.discordapp.net; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"
    );
    try {
      const url = new URL(request.url ?? '/', dependencies.origin);
      const path = url.pathname;
      if (
        path === '/health' &&
        ['GET', 'HEAD'].includes(request.method ?? '')
      ) {
        const healthy = dependencies.isHealthy?.() ?? true;
        json(response, healthy ? 200 : 503, {
          status: healthy ? 'ok' : 'unavailable',
          service: 'iconttv-discord-web',
        });
        return;
      }
      if (
        ['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method ?? '') &&
        request.headers.origin !== dependencies.origin
      ) {
        throw new HttpError(403, '허용되지 않은 요청입니다.');
      }
      if (path === '/api/session' && request.method === 'POST') {
        const body = await readJson(request);
        const token = typeof body.token === 'string' ? body.token : '';
        const session =
          token.length <= 1024 ? await dependencies.findSession(token) : null;
        if (!session || session.expiresAt.getTime() <= Date.now()) {
          response.setHeader('Set-Cookie', cookie('', 0));
          throw new HttpError(401, '링크가 만료되었거나 유효하지 않습니다.');
        }
        response.setHeader(
          'Set-Cookie',
          cookie(
            token,
            Math.max(
              0,
              Math.floor((session.expiresAt.getTime() - Date.now()) / 1000)
            )
          )
        );
        json(response, 200, { ok: true });
        return;
      }
      if (path === '/api/session' && request.method === 'DELETE') {
        response.setHeader('Set-Cookie', cookie('', 0));
        json(response, 200, { ok: true });
        return;
      }
      if (path.startsWith('/api/')) {
        const token =
          request.headers.cookie
            ?.split(';')
            .map(value => value.trim())
            .find(value => value.startsWith('itv_session='))
            ?.slice(12) ?? '';
        const session = token ? await dependencies.findSession(token) : null;
        if (!session || session.expiresAt.getTime() <= Date.now())
          throw new HttpError(
            401,
            '검색 세션이 만료되었습니다. 디스코드에서 새 링크를 받아 주세요.'
          );
        if (path === '/api/session' && request.method === 'GET') {
          const { id: _id, ...profile } = session;
          void _id;
          json(response, 200, {
            ...profile,
            capabilities: getWebCapabilities(session),
          });
          return;
        }
        const avatarRequest =
          path === '/api/avatars' && request.method === 'POST';
        if (
          (path === '/api/search' && request.method === 'GET') ||
          avatarRequest
        ) {
          const references = avatarRequest
            ? readAvatarReferences(await readJson(request), session)
            : undefined;
          const options = avatarRequest
            ? undefined
            : readOptions(url.searchParams, session);
          const now = Date.now();
          for (const [key, value] of requests)
            if (now - value.start >= 60000 && value.active === 0)
              requests.delete(key);
          const requester = `${session.guildId}:${session.userId}:${avatarRequest ? 'avatars' : 'search'}`;
          let limit = requests.get(requester);
          if (!limit) {
            if (requests.size >= 10000)
              throw new HttpError(503, '잠시 후 다시 시도해 주세요.');
            limit = { start: now, count: 0, active: 0 };
            requests.set(requester, limit);
          }
          if (limit.count >= 30 || limit.active >= 2) {
            response.setHeader('Retry-After', '60');
            throw new HttpError(
              429,
              '검색 요청이 많습니다. 잠시 후 다시 시도해 주세요.'
            );
          }
          limit.count++;
          limit.active++;
          try {
            json(
              response,
              200,
              avatarRequest
                ? {
                    avatars:
                      (await dependencies.avatars?.(session, references!)) ??
                      {},
                  }
                : await dependencies.search(session, options!)
            );
          } finally {
            limit.active--;
          }
          return;
        }
        if (path === '/api/settings') {
          if (!getWebCapabilities(session).includes('settings:write'))
            throw new HttpError(403, '서버 설정을 변경할 권한이 없습니다.');
          if (request.method === 'GET') {
            json(
              response,
              200,
              await dependencies.getSettings(session.guildId)
            );
            return;
          }
          if (request.method === 'PUT') {
            const settings = readSettings(await readJson(request));
            await dependencies.saveSettings(
              session.guildId,
              session.userId,
              settings
            );
            json(response, 200, settings);
            return;
          }
        }
        throw new HttpError(404, '요청한 기능을 찾을 수 없습니다.');
      }
      if (request.method !== 'GET' && request.method !== 'HEAD')
        throw new HttpError(405, '허용되지 않은 요청 방식입니다.');
      const asset = await getAsset(path);
      if (!asset) throw new HttpError(404, '페이지를 찾을 수 없습니다.');
      // Content-versioned public files are safe to reuse across deployments.
      // HTML, API responses, unversioned aliases and errors remain no-store.
      if (asset.immutable) {
        const cacheControl = 'public, max-age=31536000, immutable';
        response.setHeader('Cache-Control', cacheControl);
        response.setHeader('CDN-Cache-Control', cacheControl);
        response.setHeader('Cloudflare-CDN-Cache-Control', cacheControl);
      }
      response.writeHead(200, {
        'Content-Type': `${asset.type}; charset=utf-8`,
        'X-Web-Asset-Version': asset.version,
      });
      response.end(request.method === 'HEAD' ? undefined : asset.content);
    } catch (error) {
      if (response.headersSent) {
        response.end();
        return;
      }
      if (error instanceof HttpError)
        json(response, error.status, { error: error.message });
      else if (error instanceof SemanticSearchUnavailable)
        json(response, 503, {
          error:
            '임베딩 검색을 잠시 사용할 수 없습니다. 일반 검색으로 전환해 주세요.',
          code: 'SEMANTIC_UNAVAILABLE',
        });
      else {
        dependencies.onError(error);
        json(response, 503, {
          error: '서비스에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.',
        });
      }
    }
  });
  server.requestTimeout = 20000;
  server.headersTimeout = 10000;
  return server;
};
