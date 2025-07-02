import {
  GoogleGenAI,
  HarmCategory,
  HarmBlockThreshold,
  SafetySetting,
  GenerateContentParameters,
  ContentListUnion,
} from '@google/genai';

import { config } from '../../config';
import logger from '../../lib/logger';
import {
  constructSummarizationResult,
  convertMessagesToPrompt,
} from '../message';
import { makeChunk } from '../index';
import {
  QuestionMessageProps,
  SummarizeMessagesProps,
  SummarizeOutputSchemaGemini,
} from './types';

const genAI = new GoogleGenAI({
  apiKey: config.GEMINI_API_KEY || '',
});

const FLASH_PROB = 0.6;

// pro is too slow
const getModel = () =>
  Math.random() < FLASH_PROB ? 'gemini-2.0-flash' : 'gemini-2.0-flash-lite';

const unsafeSafetySettings: SafetySetting[] = [
  // {
  //   // https://github.com/google-gemini/generative-ai-js/issues/106
  //   // this category cannot be configurable due to legal issues.
  //   category: HarmCategory.HARM_CATEGORY_UNSPECIFIED,
  //   // threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
  //   threshold: HarmBlockThreshold.BLOCK_NONE,
  // },
  {
    category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
    threshold: HarmBlockThreshold.BLOCK_NONE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
    threshold: HarmBlockThreshold.BLOCK_NONE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_HARASSMENT,
    threshold: HarmBlockThreshold.BLOCK_NONE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
    threshold: HarmBlockThreshold.BLOCK_NONE,
  },
];

export const summarizeMessages = async ({
  messages,
  guildId,
  channelId,
  logRequest,
  context,
}: SummarizeMessagesProps): Promise<string | undefined> => {
  const promptSystemPromise = fetch(
    `${config.GITHUB_BASEURL}/src/utils/llm/prompt-summarization.txt`
  )
    .then(res => res.text())
    .catch(e => {
      logger.error(e);
      throw e;
    });
  const promptPersonaPromise = fetch(
    `${config.GITHUB_BASEURL}/src/utils/llm/prompt-persona.txt`
  )
    .then(res => res.text())
    .catch(e => {
      logger.error(e);
      throw e;
    });
  const [promptSystem, promptPersona] = await Promise.all([
    promptSystemPromise,
    promptPersonaPromise,
  ]);

  const modelName = getModel();

  const params: GenerateContentParameters = {
    // ContentListUnion
    contents: [],
    model: modelName,
    // GenerateContentConfig
    config: {
      responseMimeType: 'application/json',
      responseSchema: SummarizeOutputSchemaGemini,
      temperature: 0.5 + Math.random() * 0.2,
      topP: 0.1,
      frequencyPenalty: 0.5,
      presencePenalty: -0.3 + Math.random() * 0.2,
      safetySettings: [...unsafeSafetySettings],
      systemInstruction: {
        role: 'system',
        parts: [
          {
            text: promptSystem
              .replace('{{ channelName }}', context?.channelName || '')
              .replace('{{ guildName }}', context?.guildName || '')
              .replace('{{ datetime }}', new Date().toLocaleString())
              .replace('{{ persona }}', promptPersona),
          },
        ],
      },
    },
  };

  const messageChunks = makeChunk(messages, 1000);
  const messagePrompts = messageChunks.map(convertMessagesToPrompt);

  let summarizationText: string | undefined;
  for (const messagePrompt of messagePrompts) {
    const generateContents: ContentListUnion = [];

    if (summarizationText !== undefined && summarizationText.length > 0) {
      generateContents.push({
        role: 'user',
        parts: [{ text: summarizationText }],
      });
    }
    generateContents.push({
      role: 'user',
      parts: [{ text: messagePrompt }],
    });

    const geminiParams: GenerateContentParameters = {
      ...params,
      contents: generateContents,
    };

    try {
      const response = await genAI.models.generateContent(geminiParams);

      if (logRequest !== undefined) {
        await logRequest(
          'google',
          modelName,
          { ...geminiParams },
          response
        ).catch(e => logger.error(e));
      }
      const text = response.text ?? '';

      summarizationText = text;
    } catch (e) {
      if (logRequest !== undefined) {
        await logRequest(
          'google',
          modelName,
          { ...geminiParams },
          e as object
        ).catch(e => logger.error(e));
      }
      throw e;
    }
  }

  const summarization = constructSummarizationResult(
    guildId,
    channelId,
    summarizationText
  );

  return summarization + `\n(${modelName})`;
};

export const questionMessages = async ({
  messages,
  question,
  logRequest,
}: QuestionMessageProps): Promise<string | undefined> => {
  const promptSystem = await fetch(
    `${config.GITHUB_BASEURL}/src/utils/llm/prompt-question.txt`
  )
    .then(res => res.text())
    .catch(e => {
      logger.error(e);
      throw e;
    });

  const messagePrompt = convertMessagesToPrompt(messages);

  const modelName = getModel();

  const params: GenerateContentParameters = {
    contents: [],
    model: modelName,
    config: {
      temperature: 0.5 + Math.random() * 0.2,
      safetySettings: unsafeSafetySettings,
      systemInstruction: promptSystem.replace(
        '{{ datetime }}',
        new Date().toLocaleString()
      ),
    },
  };

  const geminiParams: GenerateContentParameters = {
    ...params,
    contents: [
      { role: 'user', parts: [{ text: messagePrompt }] },
      { role: 'user', parts: [{ text: `[Question] ${question}` }] },
    ],
  };

  try {
    const response = await genAI.models.generateContent(geminiParams);

    if (logRequest !== undefined) {
      await logRequest('google', modelName, { ...params }, response).catch(e =>
        logger.error(e)
      );
    }
    const text = response.text ?? '';

    const summarization = text.trim();
    return summarization + `\n(${modelName})`;
  } catch (e) {
    if (logRequest !== undefined) {
      await logRequest('google', modelName, { ...params }, e as object).catch(
        e => logger.error(e)
      );
    }
    throw e;
  }
};
