import OpenAI from 'openai';
import { config } from '../../config';
import logger from '../../lib/logger';

type LogOpenaiRequest = (
  openaiParams: object,
  response: object
) => Promise<void>;

const openai = new OpenAI({
  apiKey: config.OPENAI_SECRET,
});

export const generateImage = async (
  prompt: string,
  logOpenaiRequest: LogOpenaiRequest | undefined
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
    model: 'dall-e-3',
    n: 1,
    size: '1024x1024',
  };
  const response = await openai.images
    .generate(openaiParams)
    .then(async res => {
      if (logOpenaiRequest !== undefined) {
        await logOpenaiRequest(openaiParams, res).catch(e => logger.error(e));
      }
      return res;
    })
    .catch(async e => {
      if (logOpenaiRequest !== undefined) {
        await logOpenaiRequest(openaiParams, e).catch(e => logger.error(e));
      }
      throw e;
    });

  return [response.data[0].url, response.data[0].revised_prompt];
};
