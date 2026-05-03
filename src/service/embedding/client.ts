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
import {
  getOpenRouterHeaders,
  isOpenRouterBaseUrl,
  OpenRouterTrace,
} from '../../utils/openai';

export interface MessageTraceSpan {
  guildId?: string, channelId?: string, messageId?: string
}

const ocrChatCompletionMessageBase: OpenAI.ChatCompletionMessageParam[] = [
  {
    role: 'developer',
    content: [
      'You preprocess images for a search engine.',
      'Return exactly three lines in Korean.',
      '',
      'Line 1 must start with "설명: ".',
      'After "설명: ", write a detailed but compact natural-language description of the visible image content.',
      'Describe only visually supported content.',
      'Cover the overall scene, main subjects, secondary objects, background, setting, layout, colors, materials, shapes, textures, condition, actions, relationships between objects, and notable small details when visible.',
      'Use concrete natural Korean expressions that ordinary users would use when searching.',
      'Do not use introductory phrases like "이 이미지는", "이 사진은", "사진 속에는", or similar.',
      'Do not invent hidden objects, exact names, identities, locations, dates, brands, models, characters, functions, or unreadable text.',
      'When something is visually plausible but uncertain, describe it cautiously with Korean expressions such as "추정", "~처럼 보이는", or "~계열".',
      'When uncertainty is too high, omit it.',
      '',
      'Line 2 must start with "키워드: ".',
      'After "키워드: ", output dense Korean search keywords and short noun phrases separated by commas.',
      'Order keywords by search usefulness: most specific and visually distinctive terms first, then broader categories and supporting attributes.',
      'Generate keywords useful for keyword search, image search, and embedding-based retrieval.',
      'Use only visually supported terms.',
      'Include concrete object names, broader object categories, visible parts, visible components, materials, colors, patterns, textures, styles, shapes, functions, actions, scene type, environment, composition, and object relationships when useful.',
      'For unknown objects, use the most accurate visible category instead of guessing a specific identity.',
      'For visible text-bearing objects, include the object type and clearly visible textual labels or headings when useful.',
      'Include brand names, logos, product names, character names, place names, or organization names only when clearly readable or visually recognizable.',
      'Do not force any domain-specific keywords.',
      'Do not output duplicate keywords.',
      'Avoid generic low-value keywords unless they add useful search context.',
      'If a keyword is too uncertain, omit it.',
      '',
      'Line 3 must start with "텍스트: ".',
      'After "텍스트: ", extract only clearly readable visible text exactly as shown.',
      'Preserve original language, spelling, capitalization, numbers, symbols, punctuation, and spacing as much as possible.',
      'Preserve reading order, but replace internal OCR line breaks with ", " so the output remains exactly three lines.',
      'Do not translate, normalize, paraphrase, summarize, reorder significantly, or infer missing characters.',
      'If a word, character, or region is unreadable or too uncertain, omit that part entirely.',
      'If there is no clearly readable visible text, return "텍스트: [없음]".',
      '',
      'Do not output markdown, JSON, bullets, explanations, or extra lines.',
    ].join('\n'),
  },
];
const summarizeChatCompletionMessageBase: OpenAI.ChatCompletionMessageParam[] =
  [
    {
      role: 'developer',
      content: [
        'You are a preprocessor of document search engine. Your job is to summarize the given text or document.',
        '1. Provide a concise and precise description of the given content in Korean, excluding any embellishments or unnecessary phrases. Do not starts with words like `This content is ...`.',
        '2. Find and extract important sentences or words.',
        'Do not include any introductory or concluding sentences. Combine the results into a paragraph with a comma.',
      ].join('\n'),
    },
  ];

const embeddingDefaultHeaders = getOpenRouterHeaders(
  config.EMBEDDING_OPENAI_BASEURL,
  'iconttv'
);
const visionDefaultHeaders = getOpenRouterHeaders(
  config.VISION_OPENAI_BASEURL,
  'iconttv'
);
const shouldUseVisionOpenRouterExtras = isOpenRouterBaseUrl(
  config.VISION_OPENAI_BASEURL
);

type VisionChatCompletionCreateParams =
  OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming & {
    trace?: OpenRouterTrace;
  };

class AiClient {
  client = {
    embedding: new OpenAI({
      baseURL: config.EMBEDDING_OPENAI_BASEURL,
      apiKey: config.EMBEDDING_OPENAI_API_KEY,
      ...(embeddingDefaultHeaders
        ? { defaultHeaders: embeddingDefaultHeaders }
        : {}),
      timeout: 60 * 1000,
    }),
    llm: new OpenAI({
      baseURL: config.VISION_OPENAI_BASEURL,
      apiKey: config.VISION_OPENAI_API_KEY,
      ...(visionDefaultHeaders ? { defaultHeaders: visionDefaultHeaders } : {}),
      timeout: 60 * 1000,
    }),
  };

  model = {
    embedding: config.EMBEDDING_OPENAI_MODEL!,
    llm: config.VISION_OPENAI_MODEL!,
  };

  async createEmbeddingText(text: string): Promise<number[]> {
    const response = await this.client.embedding.embeddings.create({
      input: text,
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

  async imageToBase64(urlOrBase64: string, width = 768): Promise<string> {
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

  async imageToText(urlOrBase64: string, traceSpan?: MessageTraceSpan): Promise<string> {
    let inputImage: string;
    try {
      logger.debug(`preprocessImage start ${urlOrBase64}`);
      inputImage = await this.imageToBase64(urlOrBase64);
      logger.debug(`preprocessImage end ${urlOrBase64}`);
    } catch (error) {
      logger.error(`preprocessImage error ${urlOrBase64}\n${error}`);
      inputImage = urlOrBase64;
    }

    const params: VisionChatCompletionCreateParams = {
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
      max_completion_tokens: 1024,
      temperature: 0.1,
    };

    if (shouldUseVisionOpenRouterExtras) {
      params.trace = {
        trace_id: `${traceSpan?.guildId}_${traceSpan?.channelId}_${traceSpan?.messageId}`,
        trace_name: 'Image Transcription',
        span_name: 'Transcription Step',
        generation_name: 'Generate Transcription',
      };
    }

    const response = await this.client.llm.chat.completions.create(params);

    const caption = response.choices[0]?.message.content?.replace('[없음]','')?.trim();
    if (!caption || caption.length === 0) {
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
      max_completion_tokens: 1024,
      temperature: 0.2,
      frequency_penalty: 0.7,
    });

    const summarization = response.choices[0]?.message.content?.trim();
    if (!summarization || summarization.length === 0) {
      throw new Error(
        `caption error ${content.slice(0, 100)}...\n${JSON.stringify(response)}`
      );
    }

    return summarization;
  }
}

export const aiClient = new AiClient();
