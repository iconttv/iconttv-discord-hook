import { generateImage } from '../utils/image/openai.js';
import { saveAiRequestBuilder } from './common.js';

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
