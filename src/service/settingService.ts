import { CommandInteraction, Interaction, Message } from 'discord.js';
import DiscordSettingModel from '../database/model/DiscordSettingModel';

interface GuildSetting {
  enableFeatureIconImageResize?: boolean;
  enableCommandQuestionForEveryone?: boolean;
}

export const getGuildSetting = async (
  trigger: Message | Interaction | CommandInteraction
) => {
  const setting = await DiscordSettingModel.find({
    guildId: trigger.guildId,
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
  await DiscordSettingModel.updateOne(
    {
      guildId: trigger.guildId,
    },
    {
      $set: {
        enableCommandQuestionForEveryone:
          setting.enableCommandQuestionForEveryone,
        enableFeatureIconImageResize: setting.enableFeatureIconImageResize,
        updatedBy: trigger.member?.user.id,
      },
    },
    { upsert: true }
  );
};
