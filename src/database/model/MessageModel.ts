import mongoose from 'mongoose';

export const messageSchema = new mongoose.Schema({
  guildId: { type: String, required: true },
  channelId: { type: String, required: true },
  messageId: { type: String, required: true },
  messageType: Number,
  message: String,
  senderId: { type: String, required: true },
  guildName: String,
  channelName: String,
  senderName: String,
  createdAt: { type: Date, default: Date.now },
});

const MessageModel = mongoose.model('Message', messageSchema);

export default MessageModel;
