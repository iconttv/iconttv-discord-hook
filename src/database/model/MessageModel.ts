import mongoose from 'mongoose';

// export const messageSchema = new mongoose.Schema({
//   guildId: { type: String, required: true },
//   channelId: { type: String, required: true },
//   messageId: { type: String, required: true },
//   messageType: Number,
//   message: String,
//   isDeleted: { type: Boolean, default: false },
//   attachments: [mongoose.Schema.Types.Mixed],
//   components: [mongoose.Schema.Types.Mixed],
//   embeds: [mongoose.Schema.Types.Mixed],
//   senderId: { type: String, required: true },
//   guildName: String,
//   channelName: String,
//   senderName: String,
//   raw: mongoose.Schema.Types.Mixed,
//   createdAt: { type: Date, default: Date.now },
//   editedAt: { type: Date },
//   deletedAt: { type: Date },
// });
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
