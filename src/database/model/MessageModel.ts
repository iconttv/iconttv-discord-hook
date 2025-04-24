import mongoose from 'mongoose';

export const messageSchema = new mongoose.Schema({
  guildId: { type: String, required: true },
  channelId: { type: String, required: true },
  messageId: { type: String, required: true },
  messageType: Number,
  message: String,
  isDeleted: { type: Boolean, default: false },
  attachments: [mongoose.Schema.Types.Mixed],
  components: [mongoose.Schema.Types.Mixed],
  embeds: [mongoose.Schema.Types.Mixed],
  senderId: { type: String, required: true },
  guildName: String,
  channelName: String,
  senderName: String,
  raw: mongoose.Schema.Types.Mixed,
  createdAt: { type: Date, default: Date.now },
  editedAt: { type: Date },
  deletedAt: { type: Date },
});
messageSchema.index(
  {
    guildId: 1,
    channelId: 1,
    messageId: 1,
  },
  { unique: true }
);

const MessageModel = mongoose.model('Message', messageSchema);

export default MessageModel;
