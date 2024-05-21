import mongoose from 'mongoose';

export const openaiRequestSchema = new mongoose.Schema({
  guildId: { type: String, required: true },
  channelId: { type: String, required: true },
  senderId: String,
  discordParams: Object,
  openaiParams: Object,
  response: Object,
  createdAt: { type: Date, default: Date.now },
});

const OpenaiRequestModel = mongoose.model('OpenaiRequest', openaiRequestSchema);

export default OpenaiRequestModel;
