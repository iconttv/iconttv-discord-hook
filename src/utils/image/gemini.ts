import {
  GoogleGenAI,
  GenerateImagesParameters,
  PersonGeneration,
  SafetyFilterLevel,
} from '@google/genai';

import { config } from '../../config';
import logger from '../../lib/logger';
import { LogAiRequest } from '../../type';

const MODEL = 'imagen-3.0-generate-002' as const;

const genAI = new GoogleGenAI({
  apiKey: config.GEMINI_API_KEY || '',
});

export const generateImage = async (
  prompt: string,
  logAiRequest: LogAiRequest | undefined
) => {
  const params: GenerateImagesParameters = {
    model: MODEL,
    prompt,
    config: {
      // addWatermark: false,
      // enhancePrompt: true,
      aspectRatio: '4:3',
      personGeneration: PersonGeneration.ALLOW_ALL,
      numberOfImages: 1,
      // Only block_low_and_above is supported for safetySetting.
      safetyFilterLevel: SafetyFilterLevel.BLOCK_LOW_AND_ABOVE,
      includeSafetyAttributes: true,
      includeRaiReason: true,
    },
  };

  const result = await genAI.models
    .generateImages(params)
    .then(async res => {
      if (logAiRequest) {
        await logAiRequest('gemini', MODEL, params, res).catch(e =>
          logger.error(e)
        );
      }
      return res;
    })
    .catch(async e => {
      if (logAiRequest) {
        await logAiRequest('gemini', MODEL, params, e).catch(e =>
          logger.error(e)
        );
      }
      throw e;
    });

  if (!result.generatedImages) {
    return [undefined, undefined];
  }
  const image = result.generatedImages[0];

  if (image.raiFilteredReason) {
    throw new Error(image.raiFilteredReason);
  }

  return [image.image?.imageBytes, image.enhancedPrompt ?? prompt];
};
