import { Message } from 'discord.js';
import { replaceIcon } from '../service/iconService';
import { getGuildSetting } from '../service/settingService';
import { replaceImageToEmbed } from '../service/imageToEmbedService';

export const onMessageCreate = async (message: Message) => {
  const guildSetting = await getGuildSetting(message);

  replaceIcon(message);

  if (guildSetting?.enableFeatureIconImageResize) {
    replaceImageToEmbed(message);
  }
};
