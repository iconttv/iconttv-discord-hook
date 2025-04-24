import mongoose from 'mongoose';

export const guildPermissionSchema = new mongoose.Schema({
  guildId: { type: String, required: true },
  channelId: String,
  // 0: default, 3: gpt usable, 10: admin
  level: { type: Number, required: true },
  updatedAt: { type: Date, default: Date.now },
  updatedBy: String,
});
guildPermissionSchema.index(
  {
    guildId: 1,
  },
  { unique: true }
);

const GuildPermissionModel = mongoose.model(
  'GuildPermission',
  guildPermissionSchema
);

export default GuildPermissionModel;
