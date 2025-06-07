import { saveAiRequestBuilder } from './common';
import {
  openAiGenerateImage,
  // novelAiGenerateImage,
} from '../utils/image/index';

export const generateImageFromUser = async (
  guildId: string,
  channelId: string,
  senderId: string | undefined,
  prompt: string,
  provider: 'openai' | 'novelai'
) => {
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
