import { REST, Routes, type APIGuildMember, type APIUser } from 'discord.js';
import { config } from '../config';
import { WebAvatarCache } from '../web/avatars';
import { archivedAvatar } from '../web/messagePresentation';
import type { WebSearchScope, WebMessageReference } from '../web/types';
import MessageModel from '../database/model/MessageModel';

let rest: REST | undefined;
const profiles = new WebAvatarCache(async (guildId, userId, signal) => {
  // REST only: the independent web process never connects to the gateway.
  rest ??= new REST({
    version: '10',
    timeout: 1500,
    retries: 0,
    rejectOnRateLimit: () => true,
  }).setToken(config.DISCORD_BOT_TOKEN);
  try {
    const member = (await rest.get(Routes.guildMember(guildId, userId), {
      signal,
    })) as APIGuildMember;
    if (member.user?.id !== userId) return undefined;
    return archivedAvatar({ member, author: member.user }, userId, guildId);
  } catch (error) {
    if (
      !error ||
      typeof error !== 'object' ||
      !('status' in error) ||
      error.status !== 404
    )
      throw error;
    // Former members can still have archived messages and a global avatar.
    const user = (await rest.get(Routes.user(userId), { signal })) as APIUser;
    return user.id === userId
      ? archivedAvatar({ author: user }, userId, guildId)
      : undefined;
  }
});

export const getWebAvatars = async (
  session: WebSearchScope,
  references: WebMessageReference[]
): Promise<Record<string, string>> => {
  if (
    references.length > 25 ||
    references.some(
      reference =>
        !session.channels.some(channel => channel.id === reference.channelId)
    )
  )
    throw new Error('Avatar messages are outside session scope.');
  if (!config.DISCORD_BOT_TOKEN || !references.length) return {};
  // Resolve authors from verified messages, never from caller-supplied member IDs.
  const documents = await MessageModel.find({
    guildId: session.guildId,
    isDeleted: { $ne: true },
    $or: references.map(reference => ({
      channelId: reference.channelId,
      messageId: reference.id,
    })),
  })
    .select('senderId raw')
    .maxTimeMS(1500)
    .lean();
  const avatars = await profiles.resolve(
    session.guildId,
    documents.map(message => ({
      senderId: message.senderId,
      avatarUrl: archivedAvatar(message.raw, message.senderId, session.guildId),
    }))
  );
  return Object.fromEntries(
    avatars.map(avatar => [avatar.senderId, avatar.avatarUrl])
  );
};
