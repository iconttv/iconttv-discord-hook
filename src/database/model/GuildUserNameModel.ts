import mongoose from 'mongoose';

export const guildUserNameSchema = new mongoose.Schema({
  guildId: { type: String, required: true },
  userId: { type: String, required: true },
  userName: { type: String, required: true },
  anonUserName: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.model('GuildUserName', guildUserNameSchema);
