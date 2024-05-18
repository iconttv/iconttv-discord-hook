import mongoose from 'mongoose';

export const messageSummarizationSchema = new mongoose.Schema({
  guildId: { type: String, required: true },
  channelId: { type: String, required: true },
  hours: Number,
  count: Number,
  summarization: String,
  createdAt: { type: Date, default: Date.now },
});

const MessageSummarizationModel = mongoose.model(
  'MessageSummarization',
  messageSummarizationSchema
);

export default MessageSummarizationModel;
