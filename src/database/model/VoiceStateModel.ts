import mongoose from 'mongoose';

export type VoiceStreamType = 'streaming' | 'selfVideo';

export interface VoiceStateDocument {
  guildId: string;
  channelId: string;
  memberId: string;
  guildName?: string | null;
  channelName?: string | null;
  memberName?: string | null;
  streamType: VoiceStreamType;
  isStreaming: boolean;
  streamingElapsed?: number | null;
  streamingStartAt?: Date | null;
  streamingEndAt?: Date | null;
  createdAt?: Date | null;
  updatedAt?: Date | null;
}

export const voiceStateSchema = new mongoose.Schema<VoiceStateDocument>({
  guildId: { type: String, required: true },
  channelId: { type: String, required: true },
  memberId: { type: String, required: true },
  guildName: String,
  channelName: String,
  memberName: String,
  streamType: {
    type: String,
    enum: ['streaming', 'selfVideo'],
    required: true,
  },
  isStreaming: { type: Boolean, required: true },
  streamingElapsed: Number,
  streamingStartAt: {type: Date, default: null},
  streamingEndAt: {type: Date, default: null},
  createdAt: { type: Date, default: null },
  updatedAt: { type: Date, default: null },
})
voiceStateSchema.index(
  {
    guildId: 1,
    channelId: 1,
    memberId: 1,
    streamType: 1,
    isStreaming: 1,
  },
);

voiceStateSchema.index(
  {
    guildId: 1,
    streamType: 1,
    isStreaming: 1,
    memberId: 1,
    channelId: 1,
  },
);


const VoiceStateModel = mongoose.model<VoiceStateDocument>(
  'VoiceState',
  voiceStateSchema,
  'voiceStates'
);

export default VoiceStateModel
