import { createHmac, timingSafeEqual } from 'node:crypto';

interface TokenPayload {
  sid: string;
  exp: number;
  aud: 'iconttv-web';
}

const checkSecret = (secret: string) => {
  if (Buffer.byteLength(secret) < 32) {
    throw new Error('WEB_SESSION_SECRET must contain at least 32 bytes.');
  }
};

export const signSessionToken = (
  id: string,
  expiresAt: Date,
  secret: string
) => {
  checkSecret(secret);
  const payload: TokenPayload = {
    sid: id,
    exp: Math.floor(expiresAt.getTime() / 1000),
    aud: 'iconttv-web',
  };
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = createHmac('sha256', secret)
    .update(data)
    .digest('base64url');
  return `${data}.${signature}`;
};

export const verifySessionToken = (
  token: string,
  secret: string,
  now = Date.now()
): TokenPayload | null => {
  checkSecret(secret);
  if (token.length > 1024) return null;
  const parts = token.split('.');
  if (parts.length !== 2 || !parts.every(part => /^[\w-]+$/.test(part)))
    return null;
  const [data, signature] = parts;
  const expected = createHmac('sha256', secret).update(data).digest();
  const actual = Buffer.from(signature, 'base64url');
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
    return null;
  try {
    const payload = JSON.parse(Buffer.from(data, 'base64url').toString());
    if (
      payload.aud !== 'iconttv-web' ||
      typeof payload.sid !== 'string' ||
      !/^[a-f0-9-]{36}$/.test(payload.sid) ||
      !Number.isSafeInteger(payload.exp) ||
      payload.exp * 1000 <= now
    )
      return null;
    return payload;
  } catch {
    return null;
  }
};
