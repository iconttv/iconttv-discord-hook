import type { Guild } from 'discord.js';
import WebSessionModel from '../database/model/WebSessionModel';
import {
  discoverWebChannels,
  selectReadableWebChannels,
} from './webChannelService';
import { findWebSession } from './webSessionService';
import type { WebSession } from '../web/types';

interface AccessServices {
  findSession: typeof findWebSession;
  discoverChannels: typeof discoverWebChannels;
  save(session: WebSession): Promise<boolean>;
  markFailed(session: WebSession): Promise<void>;
}

export const createWebSessionAccessPreparer = (services: AccessServices) => {
  // Only coalesce bot jobs. Browsers observe the persisted MongoDB state.
  const pending = new Map<string, Promise<void>>();
  return (guild: Guild, token: string): Promise<void> => {
    const existing = pending.get(token);
    if (existing) return existing;
    const request = (async () => {
      const session = await services.findSession(token);
      if (
        !session ||
        session.accessResolvedAt ||
        session.accessFailedAt ||
        session.expiresAt.getTime() <= Date.now()
      )
        return;
      try {
        if (guild.id !== session.guildId)
          throw new Error('Web session guild does not match the interaction.');
        // Roles/channels follow Guilds gateway updates, but without GuildMembers
        // arbitrary cached members can retain revoked roles: always fetch them.
        const [, member, discovered] = await Promise.all([
          guild.roles.cache.has(guild.id) ? undefined : guild.roles.fetch(),
          guild.members.fetch({ user: session.userId, force: true }),
          services.discoverChannels(guild),
        ]);
        if (!member) throw new Error('Web session member is unavailable.');
        // Discovery results may be shared with another in-flight bot job.
        let candidates = discovered;
        if (
          session.initialChannelId &&
          !candidates.some(channel => channel.id === session.initialChannelId)
        ) {
          const current = await guild.channels.fetch(session.initialChannelId);
          if (current?.guildId === guild.id)
            candidates = [...candidates, current];
        }
        const channels = await selectReadableWebChannels(candidates, member);
        if (session.expiresAt.getTime() <= Date.now()) return;
        const resolved: WebSession = {
          ...session,
          channels,
          permissions: member.permissions.bitfield.toString(),
          displayName: member.displayName,
          avatarUrl: member.displayAvatarURL({ size: 128 }),
          guildName: guild.name,
          guildIconUrl: guild.iconURL({ size: 128 }) ?? '',
          accessResolvedAt: new Date(),
        };
        if (!(await services.save(resolved)))
          throw new Error('Web session access could not be persisted.');
      } catch (error) {
        await services.markFailed(session);
        throw error;
      }
    })().finally(() => pending.delete(token));
    pending.set(token, request);
    return request;
  };
};

const pendingSessionFilter = (session: WebSession) => ({
  _id: session.id,
  userId: session.userId,
  guildId: session.guildId,
  expiresAt: { $eq: session.expiresAt, $gt: new Date() },
  accessResolvedAt: { $exists: false },
  accessFailedAt: { $exists: false },
});

export const prepareWebSessionAccess = createWebSessionAccessPreparer({
  findSession: findWebSession,
  discoverChannels: discoverWebChannels,
  save: async session => {
    const { id, expiresAt, ...scope } = session;
    const result = await WebSessionModel.updateOne(
      pendingSessionFilter(session),
      { $set: scope }
    ).maxTimeMS(5000);
    return result.matchedCount === 1;
  },
  markFailed: async session => {
    await WebSessionModel.updateOne(pendingSessionFilter(session), {
      $set: { accessFailedAt: new Date(), channels: [], permissions: '0' },
    }).maxTimeMS(5000);
  },
});
