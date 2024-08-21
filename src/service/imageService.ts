import { generateImage } from '../utils/image/openai';
import { saveAiRequestBuilder } from './common';

export const generateImageFromUser = async (
  guildId: string,
  channelId: string,
  senderId: string | undefined,
  prompt: string
) => {
  return generateImage(
    prompt,
    saveAiRequestBuilder(guildId, channelId, senderId, { prompt })
  );
};
