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
        session.channelsFailedAt ||
        session.expiresAt.getTime() <= Date.now()
      )
        return;
      let partial: WebSession | undefined;
      try {
        if (guild.id !== session.guildId)
          throw new Error('Web session guild does not match the interaction.');
        // Roles/channels follow Guilds gateway updates, but without GuildMembers
        // arbitrary cached members can retain revoked roles: always fetch them.
        const [, member, current] = await Promise.all([
          guild.roles.cache.has(guild.id) ? undefined : guild.roles.fetch(),
          guild.members.fetch({ user: session.userId, force: true }),
          session.initialChannelId
            ? guild.channels.fetch(session.initialChannelId)
            : undefined,
        ]);
        if (!member) throw new Error('Web session member is unavailable.');
        const initialChannels =
          current?.guildId === guild.id
            ? await selectReadableWebChannels([current], member)
            : [];
        const profile = {
          displayName: member.displayName,
          avatarUrl: member.displayAvatarURL({ size: 128 }),
          guildName: guild.name,
          guildIconUrl: guild.iconURL({ size: 128 }) ?? '',
          permissions: member.permissions.bitfield.toString(),
        };
        if (session.expiresAt.getTime() <= Date.now()) return;
        if (initialChannels.length) {
          const verified: WebSession = {
            ...session,
            ...profile,
            channels: initialChannels,
            accessPartialAt: new Date(),
          };
          if (!(await services.save(verified)))
            throw new Error('Web session access could not be persisted.');
          partial = verified;
        }
        // Full discovery cannot delay publication of the verified current channel.
        const discovered = await services.discoverChannels(guild);
        const candidates = current?.guildId === guild.id
          ? [...discovered.filter(channel => channel.id !== current.id), current]
          : discovered;
        const channels = await selectReadableWebChannels(candidates, member);
        if (session.expiresAt.getTime() <= Date.now()) return;
        const resolved: WebSession = {
          ...(partial ?? session),
          ...profile,
          channels,
          accessResolvedAt: new Date(),
        };
        if (!(await services.save(resolved)))
          throw new Error('Web session access could not be persisted.');
      } catch (error) {
        await services.markFailed(partial ?? { ...session, accessPartialAt: undefined });
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
  channelsFailedAt: { $exists: false },
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
      $set: session.accessPartialAt
        ? { channelsFailedAt: new Date() }
        : { accessFailedAt: new Date(), channels: [], permissions: '0' },
    }).maxTimeMS(5000);
  },
});
