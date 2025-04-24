import mongoose from 'mongoose';

export const guildUserNameSchema = new mongoose.Schema({
  guildId: { type: String, required: true },
  userId: { type: String, required: true },
  userName: { type: String, required: true },
  anonUserName: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});
guildUserNameSchema.index(
  {
    guildId: 1,
    userId: 1,
  },
  { unique: true }
);

export default mongoose.model('GuildUserName', guildUserNameSchema);
