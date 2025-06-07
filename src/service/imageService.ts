import { saveAiRequestBuilder } from './common';
import {
  openAiGenerateImage,
  geminiAiGenerateImage,
  // novelAiGenerateImage,
} from '../utils/image/index';

export const generateImageFromUser = async (
  guildId: string,
  channelId: string,
  senderId: string | undefined,
  prompt: string,
  provider: 'openai' | 'gemini' | 'novelai'
) => {
  if (provider === 'gemini') {
    return geminiAiGenerateImage(
      prompt,
      saveAiRequestBuilder(guildId, channelId, senderId, { prompt })
    );
  }
  if (provider === 'openai') {
    return openAiGenerateImage(
      prompt,
      saveAiRequestBuilder(guildId, channelId, senderId, { prompt })
    );
  }
  // if (provider === 'novelai') {
  //   return novelAiGenerateImage(
  //     prompt,
  //     saveAiRequestBuilder(guildId, channelId, senderId, { prompt })
  //   );
  // }

  throw new Error('unavailable provider.');
};
