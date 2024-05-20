import mongoose from 'mongoose';

export const messageSummarizationRequestSchema = new mongoose.Schema({
  guildId: { type: String, required: true },
  channelId: { type: String, required: true },
  discordParams: Object,
  messages: { type: Array, required: true },
  model: String,
  params: Object,
  response: Object,
  createdAt: { type: Date, default: Date.now },
});

const MessageSummarizationRequestModel = mongoose.model(
  'MessageSummarizationRequest',
  messageSummarizationRequestSchema
);

export default MessageSummarizationRequestModel;
