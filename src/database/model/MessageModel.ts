import mongoose from 'mongoose';

export interface ReactionSender {
  senderId: string;
  senderName: string;
}

export interface MessageReactionEmoji {
  animated: boolean | null;
  name: string;
  id: string | null;
  reaction: string;
  identifier: string;
}

export interface MessageReactionEntry {
  emoji: MessageReactionEmoji;
  senders: ReactionSender[];
  count: number;
}

export type MessageReactions = MessageReactionEntry[];

const reactionSenderSchema = new mongoose.Schema(
  {
    senderId: { type: String, required: true },
    senderName: { type: String, required: true },
  },
  { _id: false }
);

const messageReactionEmojiSchema = new mongoose.Schema(
  {
    animated: {
      type: Boolean,
      default: null,
    },
    name: {
      type: String,
      required: true,
    },
    id: {
      type: String,
      default: null,
    },
    reaction: {
      type: String,
      required: true,
    },
    identifier: {
      type: String,
      required: true,
    },
  },
  { _id: false }
);

const messageReactionEntrySchema = new mongoose.Schema(
  {
    emoji: {
      type: messageReactionEmojiSchema,
      required: true,
    },
    senders: {
      type: [reactionSenderSchema],
      default: [],
    },
    count: {
      type: Number,
      default: 0,
    },
  },
  { _id: false }
);

export const messageSchema = new mongoose.Schema({
  guildId: { type: String, required: true },
  channelId: { type: String, required: true },
  messageId: { type: String, required: true },
  senderId: { type: String, required: true },
  messageType: Number,
  message: String,
  attachments: [mongoose.Schema.Types.Mixed],
  components: [mongoose.Schema.Types.Mixed],
  embeds: [mongoose.Schema.Types.Mixed],
  reactions: {
    type: [messageReactionEntrySchema],
    default: [],
  },
  isDeleted: { type: Boolean, default: false },
  guildName: String,
  channelName: String,
  senderName: String,
  createdAt: { type: Date, default: Date.now },
  raw: mongoose.Schema.Types.Mixed,
  deletedAt: { type: Date, default: null },
  editedAt: { type: Date, default: null },
  TEXT_MESSAGE: String,
  TEXT_ATTACHMENTS: {
    type: Map,
    of: String,
    default: null,
  },
  TEXT_COMPONENTS: {
    type: Map,
    of: String,
    default: null,
  },
  TEXT_EMBEDS: {
    type: Map,
    of: String,
    default: null,
  },
  EMBEDDING_MODEL: { type: String, default: null },
  EMBEDDING_DIM: { type: Number, default: null },
  EMBEDDING_INPUT: { type: String, default: null },
  EMBEDDING: { type: [Number], default: null },
  EMBEDDING_STATUS: { type: Boolean, default: null },
});
messageSchema.index(
  {
    guildId: 1,
    channelId: 1,
    messageId: 1,
  },
  { unique: true }
);

const MessageModel = mongoose.model(
  'Message',
  messageSchema,
  'discordMessages'
);

export default MessageModel;
