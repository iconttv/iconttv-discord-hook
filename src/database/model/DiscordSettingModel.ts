import mongoose from 'mongoose';

export const discordSettingSchema = new mongoose.Schema({
  guildId: { type: String, required: true },
  enableFeatureIconImageResize: { type: Boolean, default: false },
  enableCommandQuestionForEveryone: { type: Boolean, default: false },
  updatedAt: { type: Date, default: Date.now },
  updatedBy: { type: String },
});

discordSettingSchema.index(
  {
    guildId: 1,
  },
  { unique: true }
);

const DiscordSettingModel = mongoose.model(
  'DiscordSetting',
  discordSettingSchema
);

export default DiscordSettingModel;
