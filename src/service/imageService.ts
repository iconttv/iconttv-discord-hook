import { saveAiRequestBuilder } from './common';
import { generateImage } from '../utils/image/index';

export const generateImageFromUser = async (
  guildId: string,
  channelId: string,
  senderId: string | undefined,
  prompt: string,
  imageInputUrls: string[] | undefined
) => {
  return generateImage(
    prompt,
    imageInputUrls,
    saveAiRequestBuilder(guildId, channelId, senderId, { prompt })
  );
};
