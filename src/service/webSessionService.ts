import { randomUUID } from 'node:crypto';
import { config } from '../config';
import WebSessionModel from '../database/model/WebSessionModel';
import { signSessionToken, verifySessionToken } from '../web/sessionToken';
import type { WebSession } from '../web/types';
import { scheduleWebSessionCleanup } from './webSessionCleanupService';

export const getWebConfiguration = () => {
  const secret = config.WEB_SESSION_SECRET ?? '';
  if (Buffer.byteLength(secret) < 32)
    throw new Error('WEB_SESSION_SECRET must contain at least 32 bytes.');
  const origin = new URL(config.WEB_PUBLIC_URL);
  if (
    origin.pathname !== '/' ||
    origin.search ||
    origin.hash ||
    origin.username ||
    origin.password ||
    (origin.protocol !== 'https:' &&
      !(config.ENV === 'dev' && origin.protocol === 'http:'))
  ) {
    throw new Error(
      'WEB_PUBLIC_URL must be an HTTPS origin without a path (HTTP is also allowed in dev).'
    );
  }
  const ttl = Number(config.WEB_SESSION_TTL_SECONDS);
  if (!Number.isInteger(ttl) || ttl < 60 || ttl > 86400)
    throw new Error('WEB_SESSION_TTL_SECONDS must be between 60 and 86400.');
  return { secret, origin: origin.origin, ttl };
};

export const createWebSession = async (
  identity: Omit<WebSession, 'id' | 'expiresAt'>
) => {
  const { secret, ttl } = getWebConfiguration();
  const id = randomUUID();
  const expiresAt = new Date(Math.floor(Date.now() / 1000) * 1000 + ttl * 1000);
  await WebSessionModel.create({ _id: id, ...identity, expiresAt });
  scheduleWebSessionCleanup();
  return { token: signSessionToken(id, expiresAt, secret), expiresAt };
};

export const findWebSession = async (
  token: string
): Promise<WebSession | null> => {
  const { secret } = getWebConfiguration();
  const payload = verifySessionToken(token, secret);
  if (!payload) return null;
  const session = await WebSessionModel.findOne({
    _id: payload.sid,
    expiresAt: { $gt: new Date() },
  }).lean();
  if (!session || session.expiresAt.getTime() !== payload.exp * 1000)
    return null;
  return {
    id: session._id,
    userId: session.userId,
    displayName: session.displayName,
    avatarUrl: session.avatarUrl,
    guildId: session.guildId,
    guildName: session.guildName,
    guildIconUrl: session.guildIconUrl,
    channels: session.channels.map(({ id, name, category, parentName }) => ({
      id,
      name,
      category,
      parentName,
    })),
    permissions: session.permissions,
    expiresAt: session.expiresAt,
  };
};
