import OpenAI from 'openai';
import {
  isLiveUrl,
  isUrl,
  readBase64Image,
  readImage,
  readUrl,
} from './toolkit';
import sharp from 'sharp';
import { config } from '../../config';
import logger from '../../lib/logger';

const EMPTY_TOKEN = '!!empty!!';

const ocrChatCompletionMessageBase: OpenAI.ChatCompletionMessageParam[] = [
  {
    role: 'developer',
    content: [
      'You are a helpful assistant. Your job is describe an image to text as preprocessor.',
      '1. Provide a concise and precise description of the entire image content in Korean, excluding any embellishments or unnecessary phrases. Do not starts with words like `This image is ...`.',
      '2. Accurately extract and list all text (letters, numbers, any language) exactly as it appears in the image, without converting it into sentences, adding extra words, nor translating to another language. Separate texts with commas or spaces.',
      'Do not include any introductory or concluding sentences. Combine the image description and text extraction into a short paragraph with a comma.',
      'If the image is empty or not acceptable, respond with one word: `' +
        EMPTY_TOKEN +
        '`.',
    ].join('\n'),
  },
];
const summarizeChatCompletionMessageBase: OpenAI.ChatCompletionMessageParam[] =
  [
    {
      role: 'developer',
      content: [
        'You are a helpful assistant. Your job is to summarize text as preprocessor.',
        '1. Provide a concise and precise description of the given content in Korean, excluding any embellishments or unnecessary phrases. Do not starts with words like `This content is ...`.',
        '2. Find and extract important sentences or words.',
        'Do not include any introductory or concluding sentences. Combine the results into multiple lines with new lines.',
        'If the text is empty or not acceptable, respond with one word: `' +
          EMPTY_TOKEN +
          '`.',
      ].join('\n'),
    },
  ];

class AiClient {
  client = {
    embedding: new OpenAI({
      baseURL: config.EMBEDDING_OPENAI_BASEURL,
      apiKey: config.EMBEDDING_OPENAI_API_KEY,
      defaultHeaders: {
        'HTTP-Referer': 'https://github.com/iconttv',
        'X-Title': 'iconttv',
      },
    }),
    llm: new OpenAI({
      baseURL: config.VISION_OPENAI_BASEURL,
      apiKey: config.VISION_OPENAI_API_KEY,
      defaultHeaders: {
        'HTTP-Referer': 'https://github.com/iconttv',
        'X-Title': 'iconttv',
      },
    }),
  };

  model = {
    embedding: config.EMBEDDING_OPENAI_MODEL!,
    llm: config.VISION_OPENAI_MODEL!,
  };

  async createEmbeddingText(text: string): Promise<number[]> {
    const response = await this.client.embedding.embeddings.create({
      input: `title: none | text: ${text}`,
      model: this.model.embedding,
    });
    const embedding = response.data[0]?.embedding;
    if (!embedding) {
      throw new Error(`response is None. ${response}`);
    }
    return embedding;
  }

  async urlToText(url: string): Promise<string> {
    const htmlMarkdown = await readUrl(url);
    return htmlMarkdown;
  }

  async imageToBase64(urlOrBase64: string, width = 300): Promise<string> {
    if (isUrl(urlOrBase64) && !(await isLiveUrl(urlOrBase64))) {
      throw new Error(`URL is dead ${urlOrBase64}`);
    }

    let contentType: string;
    let imageBase64: ArrayBuffer;
    if (isUrl(urlOrBase64)) {
      [contentType, imageBase64] = await readImage(urlOrBase64);
    } else {
      [contentType, imageBase64] = readBase64Image(urlOrBase64);
    }

    const buf = Buffer.from(new Uint8Array(imageBase64));

    const imageSharp = sharp(buf, { animated: true });
    const imageBuffer = await imageSharp
      .resize(width, null, { withoutEnlargement: true })
      .toBuffer();

    return `data:${contentType};base64,${imageBuffer.toString('base64')}`;
  }

  async imageToText(urlOrBase64: string): Promise<string> {
    let inputImage: string;
    try {
      logger.debug(`preprocessImage start ${urlOrBase64}`);
      inputImage = await this.imageToBase64(urlOrBase64);
      logger.debug(`preprocessImage end ${urlOrBase64}`);
    } catch (error) {
      logger.error(`preprocessImage error ${urlOrBase64}\n${error}`);
      inputImage = urlOrBase64;
    }

    const response = await this.client.llm.chat.completions.create({
      model: this.model.llm,
      messages: [
        ...ocrChatCompletionMessageBase,
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: {
                url: inputImage,
              },
            },
          ],
        },
      ],
      max_completion_tokens: 400,
      temperature: 0.2,
    });

    const caption = response.choices[0]?.message.content
      ?.replace(EMPTY_TOKEN, '')
      .trim();
    if (!caption || caption.length === 0 || caption === EMPTY_TOKEN) {
      throw new Error(
        `caption error ${urlOrBase64}\n${inputImage.slice(
          0,
          100
        )}...\n${JSON.stringify(response)}`
      );
    }

    return caption;
  }

  async textFileToText(fileUrl: string): Promise<string> {
    if (isUrl(fileUrl) && !(await isLiveUrl(fileUrl))) {
      throw new Error(`URL is dead ${fileUrl}`);
    }

    const response = await fetch(fileUrl);
    const text = await response.text();
    if (!response.ok) {
      throw new Error(text);
    }
    return this._summarizeText(text);
  }

  async _summarizeText(content: string): Promise<string> {
    const response = await this.client.llm.chat.completions.create({
      model: this.model.llm,
      messages: [
        ...summarizeChatCompletionMessageBase,
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Summarize following content.',
            },
            {
              type: 'text',
              text: content,
            },
          ],
        },
      ],
      max_completion_tokens: 400,
      temperature: 0.2,
      frequency_penalty: 0.7,
    });

    const summarization = response.choices[0]?.message.content
      ?.replace(EMPTY_TOKEN, '')
      .trim();
    if (
      !summarization ||
      summarization.length === 0 ||
      summarization === EMPTY_TOKEN
    ) {
      throw new Error(
        `caption error ${content.slice(0, 100)}...\n${JSON.stringify(response)}`
      );
    }

    return summarization;
  }
}

export const aiClient = new AiClient();
