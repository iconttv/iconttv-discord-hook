import {
  Message,
  MessageReaction,
  PartialMessage,
  PartialMessageReaction,
  PartialUser,
  User,
} from 'discord.js';
import MessageModel, {
  type MessageReactionEntry,
  type MessageReactions,
  type ReactionSender,
} from '../../database/model/MessageModel';
import {
  type MessageIdentityFilter,
  getMessageIdentityFilterFromMessage,
  getSenderName,
  resolveGuildMember,
} from '../../utils/discord';
import logger from '../../lib/logger';

type ReactionEntity = MessageReaction | PartialMessageReaction;

type MessageReactionChangeEvent =
  | {
      type: 'add' | 'remove';
      reaction: ReactionEntity;
      user: User | PartialUser;
    }
  | {
      type: 'removeAll';
      message: Message | PartialMessage;
    }
  | {
      type: 'removeEmoji';
      reaction: ReactionEntity;
    };

const toSender = async (
  message: Message | PartialMessage,
  user: User | PartialUser
): Promise<ReactionSender> => {
  const guildMember = await resolveGuildMember(message, user.id);
  return {
    senderId: user.id,
    senderName: getSenderName(guildMember),
  };
};

const toReactionEmoji = (
  reaction: ReactionEntity
): MessageReactionEntry['emoji'] => {
  return {
    animated: reaction.emoji.animated,
    name: reaction.emoji.name ?? '',
    id: reaction.emoji.id,
    reaction: reaction.emoji.toString(),
    identifier: reaction.emoji.identifier,
  };
};

const getReactionState = async (
  reaction: ReactionEntity,
  fallbackUser?: User | PartialUser
): Promise<MessageReactionEntry | null> => {
  const users = await reaction.users.fetch();
  const senders = await Promise.all(
    users.map(user => toSender(reaction.message, user))
  );

  if (senders.length === 0 && fallbackUser) {
    senders.push(await toSender(reaction.message, fallbackUser));
  }

  const count = reaction.count ?? senders.length;
  return {
    emoji: toReactionEmoji(reaction),
    senders,
    count,
  };
};

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null;
};

const toStoredSender = (value: unknown): ReactionSender | null => {
  if (!isRecord(value)) {
    return null;
  }

  const senderId = value.senderId;
  const senderName = value.senderName;
  if (typeof senderId !== 'string' || typeof senderName !== 'string') {
    return null;
  }

  return {
    senderId,
    senderName,
  };
};

const createFallbackEmoji = (
  identifier: string
): MessageReactionEntry['emoji'] => {
  return {
    animated: null,
    name: '',
    id: null,
    reaction: '',
    identifier,
  };
};

const normalizeStoredEmoji = (
  value: unknown,
  fallbackIdentifier?: string
): MessageReactionEntry['emoji'] | null => {
  if (!isRecord(value)) {
    return fallbackIdentifier ? createFallbackEmoji(fallbackIdentifier) : null;
  }

  const resolvedIdentifier =
    typeof value.identifier === 'string' && value.identifier.length > 0
      ? value.identifier
      : fallbackIdentifier;
  if (!resolvedIdentifier) {
    return null;
  }

  return {
    animated: typeof value.animated === 'boolean' ? value.animated : null,
    name: typeof value.name === 'string' ? value.name : '',
    id: typeof value.id === 'string' ? value.id : null,
    reaction: typeof value.reaction === 'string' ? value.reaction : '',
    identifier: resolvedIdentifier,
  };
};

const normalizeStoredReactionEntry = (
  value: unknown,
  fallbackIdentifier?: string
): MessageReactionEntry | null => {
  if (!isRecord(value)) {
    return null;
  }

  const emoji = normalizeStoredEmoji(value.emoji, fallbackIdentifier);
  if (!emoji) {
    return null;
  }

  const senders = Array.isArray(value.senders)
    ? value.senders
        .map(sender => toStoredSender(sender))
        .filter((sender): sender is ReactionSender => sender !== null)
    : [];
  const count = typeof value.count === 'number' ? value.count : senders.length;

  return {
    emoji,
    senders,
    count,
  };
};

const normalizeStoredReactions = (value: unknown): MessageReactions => {
  if (Array.isArray(value)) {
    return value
      .map(entry => normalizeStoredReactionEntry(entry))
      .filter((entry): entry is MessageReactionEntry => entry !== null);
  }

  if (value instanceof Map) {
    return Array.from(value.entries())
      .map(([identifier, entry]) =>
        normalizeStoredReactionEntry(
          entry,
          typeof identifier === 'string' ? identifier : undefined
        )
      )
      .filter((entry): entry is MessageReactionEntry => entry !== null);
  }

  if (isRecord(value)) {
    return Object.entries(value)
      .map(([identifier, entry]) =>
        normalizeStoredReactionEntry(entry, identifier)
      )
      .filter((entry): entry is MessageReactionEntry => entry !== null);
  }

  return [];
};

const getStoredReactions = async (
  filter: MessageIdentityFilter
): Promise<MessageReactions> => {
  const message = await MessageModel.findOne(filter, { reactions: 1 }).lean<{
    reactions?: unknown;
  }>();
  return normalizeStoredReactions(message?.reactions);
};

const removeReactionEntry = (
  reactions: MessageReactions,
  identifier: string
): MessageReactions => {
  return reactions.filter(entry => entry.emoji.identifier !== identifier);
};

const upsertReactionEntry = (
  reactions: MessageReactions,
  nextEntry: MessageReactionEntry
): MessageReactions => {
  const targetIdentifier = nextEntry.emoji.identifier;
  const existingEntryIndex = reactions.findIndex(
    entry => entry.emoji.identifier === targetIdentifier
  );

  if (existingEntryIndex < 0) {
    return [...reactions, nextEntry];
  }

  const nextReactions = [...reactions];
  nextReactions[existingEntryIndex] = nextEntry;
  return nextReactions;
};

export const onMessageReactionChange = async (
  event: MessageReactionChangeEvent
) => {
  logger.debug(`onMessageReactionChange-1 ${event.type}`)

  if (event.type === 'removeAll') {
    const filter = getMessageIdentityFilterFromMessage(event.message);
    if (!filter) {
      return;
    }

    await MessageModel.findOneAndUpdate(
      filter,
      {
        reactions: [],
      },
      { upsert: false }
    );
    return;
  }

  logger.debug(`onMessageReactionChange-2 ${event.reaction.emoji.identifier}`)
  const reaction = event.reaction;

  if (reaction.partial) {
    await reaction.fetch();
  }

  const filter = getMessageIdentityFilterFromMessage(reaction.message);
  if (!filter) {
    return;
  }

  const reactionKey = reaction.emoji.identifier;
  if (!reactionKey) {
    return;
  }

  if (event.type === 'removeEmoji') {
    const reactions = await getStoredReactions(filter);
    const nextReactions = removeReactionEntry(reactions, reactionKey);

    logger.debug(`onMessageReactionChange-3 ${event.type} ${reactionKey}`)
    await MessageModel.findOneAndUpdate(
      filter,
      {
        $set: {
          reactions: nextReactions,
        },
      },
      { upsert: false }
    );
    return;
  }

  const reactionState = await getReactionState(reaction, event.user);
  if (!reactionState || reactionState.count <= 0) {
    const reactions = await getStoredReactions(filter);
    const nextReactions = removeReactionEntry(reactions, reactionKey);

    logger.debug(`onMessageReactionChange-3 ${event.type} ${reactionKey}`)
    await MessageModel.findOneAndUpdate(
      filter,
      {
        $set: {
          reactions: nextReactions,
        },
      },
      { upsert: false }
    );
    return;
  }

  const reactions = await getStoredReactions(filter);
  const nextReactions = upsertReactionEntry(reactions, reactionState);

  logger.debug(`onMessageReactionChange-3 ${event.type} ${reactionKey}`)
  await MessageModel.findOneAndUpdate(
    filter,
    {
      $set: {
        reactions: nextReactions,
      },
    },
    { upsert: false }
  );
};
