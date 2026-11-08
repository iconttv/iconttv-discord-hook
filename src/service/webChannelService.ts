import {
  ChannelType,
  Guild,
  GuildBasedChannel,
  GuildMember,
  PermissionFlagsBits,
} from 'discord.js';
import MessageModel from '../database/model/MessageModel';
import type { WebChannel } from '../web/types';

interface DiscoveryCache {
  ids?: { values: string[]; expiresAt: number };
  archived: Map<
    string,
    { channel: GuildBasedChannel | null; expiresAt: number }
  >;
  pending?: Promise<GuildBasedChannel[]>;
}

const discoveryCaches = new WeakMap<Guild, DiscoveryCache>();

export const discoverWebChannels = (
  guild: Guild
): Promise<GuildBasedChannel[]> => {
  let cache = discoveryCaches.get(guild);
  if (!cache) {
    cache = { archived: new Map() };
    discoveryCaches.set(guild, cache);
  }
  if (cache.pending) return cache.pending;
  const state = cache;
  state.pending = loadWebChannels(guild, state).finally(() => {
    state.pending = undefined;
  });
  return state.pending;
};

const loadWebChannels = async (
  guild: Guild,
  cache: DiscoveryCache
): Promise<GuildBasedChannel[]> => {
  // Cache archive IDs, not user permissions. Refresh live parents/overwrites
  // every time, and still check the issuer's roles and private-thread membership.
  const ids =
    cache.ids && cache.ids.expiresAt > Date.now()
      ? Promise.resolve(cache.ids.values)
      : MessageModel.distinct('channelId', { guildId: guild.id })
          .maxTimeMS(10000)
          .then(values => {
            const filtered = values.filter(
              (id): id is string => typeof id === 'string' && /^\d+$/.test(id)
            );
            cache.ids = {
              values: filtered,
              expiresAt: Date.now() + 5 * 60 * 1000,
            };
            return filtered;
          });
  const [available, active, storedIds] = await Promise.all([
    guild.channels.fetch(),
    guild.channels.fetchActiveThreads(),
    ids,
  ]);
  const candidates = new Map<string, GuildBasedChannel>();
  for (const channel of [...available.values(), ...active.threads.values()]) {
    if (channel) candidates.set(channel.id, channel);
  }
  // Archived threads aren't returned by the active-thread endpoint. Resolve
  // channel IDs present in our archive against Discord before granting access.
  const missing = storedIds.filter(
    id => /^\d+$/.test(id) && !candidates.has(id)
  );
  for (let offset = 0; offset < missing.length; offset += 5) {
    await Promise.all(
      missing.slice(offset, offset + 5).map(async id => {
        const cached = cache.archived.get(id);
        if (cached && cached.expiresAt > Date.now()) {
          if (!cached.channel) return;
          // Use the SDK's current object so gateway updates/deletions take effect.
          const current = guild.channels.cache.get(id);
          if (current?.guildId === guild.id) {
            candidates.set(id, current);
            return;
          }
        }
        const channel = await guild.channels
          .fetch(id, { force: true })
          .catch(() => null);
        const verified = channel?.guildId === guild.id ? channel : null;
        cache.archived.delete(id);
        cache.archived.set(id, {
          channel: verified,
          expiresAt: Date.now() + (verified ? 30000 : 60000),
        });
        while (cache.archived.size > 2000)
          cache.archived.delete(cache.archived.keys().next().value!);
        if (verified) candidates.set(verified.id, verified);
      })
    );
  }
  return [...candidates.values()];
};

export const selectReadableWebChannels = async (
  candidates: GuildBasedChannel[],
  member: GuildMember,
  onlyChannelId?: string
): Promise<WebChannel[]> => {
  const unique = [
    ...new Map(candidates.map(channel => [channel.id, channel])).values(),
  ];
  const readable: WebChannel[] = [];
  // Bound private-thread membership lookups rather than issuing one REST request
  // per thread simultaneously. Missing parent/member information fails closed.
  for (let offset = 0; offset < unique.length; offset += 5) {
    await Promise.all(
      unique.slice(offset, offset + 5).map(async channel => {
        if (onlyChannelId && channel.id !== onlyChannelId) return;
        if (!channel.isTextBased()) return;
        const permissions = channel.permissionsFor(member);
        if (
          !permissions?.has([
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.ReadMessageHistory,
          ])
        )
          return;
        if (
          channel.isThread() &&
          channel.type === ChannelType.PrivateThread &&
          !permissions.has(PermissionFlagsBits.ManageThreads)
        ) {
          const membership = await channel.members
            .fetch({ member: member.id, force: true })
            .catch(() => null);
          if (!membership) return;
        }
        readable.push({
          id: channel.id,
          name: channel.name,
          category: channel.isThread()
            ? (channel.parent?.parent?.name ?? '')
            : (channel.parent?.name ?? ''),
          parentName: channel.isThread() ? channel.parent?.name : undefined,
        });
      })
    );
  }
  return readable.sort(
    (a, b) =>
      a.category.localeCompare(b.category, 'ko') ||
      (a.parentName || a.name).localeCompare(b.parentName || b.name, 'ko') ||
      a.name.localeCompare(b.name, 'ko')
  );
};
