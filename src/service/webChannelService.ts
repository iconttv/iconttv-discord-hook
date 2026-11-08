import {
  ChannelType,
  Guild,
  GuildBasedChannel,
  GuildMember,
  PermissionFlagsBits,
} from 'discord.js';
import MessageModel from '../database/model/MessageModel';
import type { WebChannel } from '../web/types';

export const discoverWebChannels = async (
  guild: Guild
): Promise<GuildBasedChannel[]> => {
  const available = await guild.channels.fetch();
  const active = await guild.channels.fetchActiveThreads();
  const candidates = new Map<string, GuildBasedChannel>();
  for (const channel of [...available.values(), ...active.threads.values()]) {
    if (channel) candidates.set(channel.id, channel);
  }
  // Archived threads aren't returned by the active-thread endpoint. Resolve
  // channel IDs present in our archive against Discord before granting access.
  const storedIds: string[] = await MessageModel.distinct('channelId', {
    guildId: guild.id,
  }).maxTimeMS(10000);
  const missing = storedIds.filter(
    id => /^\d+$/.test(id) && !candidates.has(id)
  );
  for (let offset = 0; offset < missing.length; offset += 5) {
    await Promise.all(
      missing.slice(offset, offset + 5).map(async id => {
        const channel = await guild.channels
          .fetch(id, { force: true })
          .catch(() => null);
        if (channel?.guildId === guild.id) candidates.set(channel.id, channel);
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
