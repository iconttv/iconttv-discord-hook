import OpenAI from 'openai';
import { config } from '../../config';
import logger from '../../lib/logger';
import { LogAiRequest } from '../../type/index';

const MODEL = 'dall-e-3' as const;

const openai = new OpenAI({
  apiKey: config.IMAGE_OPENAI_API_KEY,
});

export const generateImage = async (
  prompt: string,
  logOpenaiRequest: LogAiRequest | undefined
): Promise<[string | undefined, string | undefined]> => {
  const prePrompt = await fetch(
    `${config.GITHUB_BASEURL}/src/utils/image/prompt-generation.txt`
  )
    .then(res => res.text())
    .catch(e => {
      logger.error(e);
      throw e;
    });

  const openaiParams: OpenAI.ImageGenerateParams = {
    prompt: `${prePrompt} ${prompt}`,
    model: MODEL,
    n: 1,
    size: '1024x1024',
  };
  const response = await openai.images
    .generate(openaiParams)
    .then(async res => {
      if (logOpenaiRequest) {
        await logOpenaiRequest('openai', MODEL, openaiParams, res).catch(e =>
          logger.error(e)
        );
      }
      return res;
    })
    .catch(async e => {
      if (logOpenaiRequest) {
        await logOpenaiRequest('openai', MODEL, openaiParams, e).catch(e =>
          logger.error(e)
        );
      }
      throw e;
    });

  return [
    response.data?.[0].b64_json ?? response.data?.[0].url,
    response.data?.[0].revised_prompt,
  ];
};
