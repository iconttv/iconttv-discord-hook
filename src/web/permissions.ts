import { PermissionFlagsBits, PermissionsBitField } from 'discord.js';
import type { WebSession } from './types';

export const hasWebPermission = (
  session: Pick<WebSession, 'permissions'>,
  permission: bigint
) => {
  try {
    if (!/^\d+$/.test(session.permissions)) return false;
    return new PermissionsBitField(BigInt(session.permissions)).has(permission);
  } catch {
    return false;
  }
};

export const getWebCapabilities = (session: Pick<WebSession, 'permissions'>) =>
  hasWebPermission(session, PermissionFlagsBits.ModerateMembers)
    ? ['settings:write']
    : [];
