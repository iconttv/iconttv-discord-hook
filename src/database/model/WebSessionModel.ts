import mongoose from 'mongoose';

export const WEB_SESSION_RETENTION_SECONDS = 30 * 24 * 60 * 60;

const channelSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    name: { type: String, required: true },
    category: { type: String, default: '' },
    parentName: { type: String, default: '' },
  },
  { _id: false }
);

const webSessionSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    userId: { type: String, required: true },
    displayName: { type: String, required: true },
    avatarUrl: { type: String, default: '' },
    guildId: { type: String, required: true },
    guildName: { type: String, required: true },
    guildIconUrl: { type: String, default: '' },
    channels: { type: [channelSchema], default: [] },
    permissions: { type: String, default: '0' },
    createdAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true },
  },
  {
    // Managed explicitly so deployments can update the old zero-delay TTL with
    // collMod rather than fail automatic index creation on conflicting options.
    autoIndex: false,
  }
);

webSessionSchema.index(
  { expiresAt: 1 },
  { expireAfterSeconds: WEB_SESSION_RETENTION_SECONDS }
);

export default mongoose.model('WebSession', webSessionSchema);
