import mongoose from 'mongoose';

export const AiRequestSchema = new mongoose.Schema({
  guildId: { type: String, required: true },
  channelId: { type: String, required: true },
  senderId: String,
  provider: String,
  discordParams: Object,
  modelName: String,
  aiParams: Object,
  response: Object,
  createdAt: { type: Date, default: Date.now },
});
AiRequestSchema.index({
  guildId: 1,
  channelId: 1,
});

const AiRequestModel = mongoose.model('AiRequest', AiRequestSchema);

export default AiRequestModel;
