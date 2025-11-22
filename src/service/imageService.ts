import { saveAiRequestBuilder } from './common';
import { openRouterGenerateImage } from '../utils/image/index';

export const generateImageFromUser = async (
  guildId: string,
  channelId: string,
  senderId: string | undefined,
  prompt: string,
  imageInputUrls: string[] | undefined
) => {
  return openRouterGenerateImage(
    prompt,
    imageInputUrls,
    saveAiRequestBuilder(guildId, channelId, senderId, { prompt })
  );

  throw new Error('unavailable provider.');
};
