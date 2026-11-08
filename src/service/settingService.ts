import { CommandInteraction, Interaction, Message } from 'discord.js';
import DiscordSettingModel from '../database/model/DiscordSettingModel';

export interface GuildSetting {
  enableFeatureIconImageResize?: boolean;
  enableCommandQuestionForEveryone?: boolean;
}

export const getGuildSetting = async (
  trigger: Message | Interaction | CommandInteraction
) => {
  return getGuildSettingById(trigger.guildId);
};

export const getGuildSettingById = async (guildId: string | null) => {
  if (!guildId) return null;
  const setting = await DiscordSettingModel.find({
    guildId,
  })
    .limit(1)
    .exec();
  if (!setting || setting.length === 0) {
    return null;
  }
  return setting[0];
};

export const setGuildSetting = async (
  trigger: Message | Interaction | CommandInteraction,
  setting: GuildSetting
) => {
  if (!trigger.guildId) throw new Error('Guild is required.');
  await setGuildSettingById(trigger.guildId, trigger.member?.user.id, setting);
};

export const setGuildSettingById = async (
  guildId: string,
  actorUserId: string | undefined,
  setting: GuildSetting
) => {
  const changes: GuildSetting = {};
  if (typeof setting.enableCommandQuestionForEveryone === 'boolean') {
    changes.enableCommandQuestionForEveryone = setting.enableCommandQuestionForEveryone;
  }
  if (typeof setting.enableFeatureIconImageResize === 'boolean') {
    changes.enableFeatureIconImageResize = setting.enableFeatureIconImageResize;
  }
  await DiscordSettingModel.updateOne(
    {
      guildId,
    },
    {
      $set: {
        ...changes,
        updatedBy: actorUserId,
        updatedAt: new Date(),
      },
    },
    { upsert: true }
  );
};
