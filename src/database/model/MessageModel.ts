import mongoose from 'mongoose';

export const messageSchema = new mongoose.Schema({
  channelId: { type: String, required: true },
  guildId: { type: String, required: true },
  messageId: { type: String, required: true },
  messageType: Number,
  message: String,
  senderId: { type: String, required: true },
  channelName: String,
  guildName: String,
  senderName: String,
  createdAt: { type: Date, default: Date.now },
});

const MessageModel = mongoose.model('Message', messageSchema);

export default MessageModel;
