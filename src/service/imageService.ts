import { generateImage } from '../utils/image/openai';
import { saveOpenaiRequestBuilder } from './common';

export const generateImageFromUser = async (
  guildId: string,
  channelId: string,
  senderId: string | undefined,
  prompt: string
) => {
  return generateImage(
    prompt,
    saveOpenaiRequestBuilder(guildId, channelId, senderId, { prompt })
  );
};
