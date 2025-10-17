import { config } from '../../config';
import logger from '../../lib/logger';
import { LogAiRequest } from '../../type';

const models = config.OPENROUTER_IMAGE_MODELS.split(',')
  .map(model => model.trim())
  .filter(model => model.length > 0);

const getModel = () => {
  const idx = Math.floor(Math.random() * models.length);
  return models[idx];
};

type ImageUrl = string;

export const generateImage = async (
  prompt: string,
  logOpenaiRequest: LogAiRequest | undefined
): Promise<[string, ImageUrl[]]> => {
  const model = getModel();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const params: Record<string, any> = {
    model: model,
    messages: [
      {
        role: 'user',
        content:
          'Generate a image or images with a given description. If you refuse then give a brief reason. Description: ',
      },
      {
        role: 'user',
        content: prompt,
      },
    ],
    modalities: ['image', 'text'],
  };

  if (model.startsWith('google/')) {
    params.provider = {
      // use google-vertex to specify safety_settings
      ignore: ['Google AI Studio'],
    };
    params.google = {
      safety_settings: [
        {
          category: 'HARM_CATEGORY_HARASSMENT',
          threshold: 'BLOCK_NONE',
        },
        {
          category: 'HARM_CATEGORY_HATE_SPEECH',
          threshold: 'BLOCK_NONE',
        },
        {
          category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
          threshold: 'BLOCK_NONE',
        },
        {
          category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
          threshold: 'BLOCK_NONE',
        },
        {
          category: 'HARM_CATEGORY_CIVIC_INTEGRITY',
          threshold: 'BLOCK_NONE',
        },
      ],
    };
  }

  const response = await fetch(
    'https://openrouter.ai/api/v1/chat/completions',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://github.com/iconttv', // Optional. Site URL for rankings on openrouter.ai.
        'X-Title': 'iconttv-discord', // Optional. Site title for rankings on openrouter.ai.
      },
      body: JSON.stringify(params),
    }
  );
  const result = await response.json();
  if (!response.ok) {
    logger.error(result);
    await logOpenaiRequest?.('openrouter', model, params, result).catch(e =>
      logger.error(e)
    );
    throw 'server error';
  }

  const choices = result.choices;
  if (!Array.isArray(choices) || choices.length === 0) {
    throw 'no response';
  }
  const content = choices[0]?.message?.content;
  const images = choices[0]?.message?.images;
  if (!Array.isArray(images) || images.length === 0) {
    throw content ?? 'no image response';
  }

  return [
    model,
    images
      .map(image => image?.image_url?.url)
      .filter(url => typeof url === 'string' && url.length > 0),
  ];
};
