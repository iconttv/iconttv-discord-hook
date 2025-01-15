import {
  GoogleGenerativeAI,
  HarmCategory,
  HarmBlockThreshold,
  ModelParams,
  GenerateContentRequest,
  SafetySetting,
  Content as GenerateContentRequestContent,
} from '@google/generative-ai';
import { config } from '../../config';
import logger from '../../lib/logger';
import { LogAiRequest, MessageFromDatabase } from '../../type/index';
import {
  constructSummarizationResult,
  convertMessagesToPrompt,
} from '../message';
import { makeChunk } from '../index';
import { SummarizeOutputSchemaGemini } from './types';

const genAI = new GoogleGenerativeAI(config.GEMINI_API_KEY || '');

const FLASH_PROB = 1.1;

// pro is too slow
const getModel = () =>
  Math.random() < FLASH_PROB ? 'gemini-1.5-flash' : 'gemini-1.5-pro';

const unsafeSafetySettings: SafetySetting[] = [
  // {
  //   // https://github.com/google-gemini/generative-ai-js/issues/106
  //   // this category cannot be configurable due to legal issues.
  //   category: HarmCategory.HARM_CATEGORY_UNSPECIFIED,
  //   threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
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

export const summarizeMessages = async (
  messages: MessageFromDatabase[],
  guildId: string,
  channelId: string,
  logRequest: LogAiRequest | undefined
): Promise<string | undefined> => {
  const promptSystem = await fetch(
    `${config.GITHUB_BASEURL}/src/utils/llm/prompt-summarization.txt`
  )
    .then(res => res.text())
    .catch(e => {
      logger.error(e);
      throw e;
    });

  const modelName = getModel();
  const modelParams: ModelParams = {
    model: modelName,
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: SummarizeOutputSchemaGemini,
    },
  };

  const generateParams = {
    generationConfig: {
      temperature: 0.5 + Math.random() * 0.2,
    },
    safetySettings: [...unsafeSafetySettings],
    systemInstruction: promptSystem,
  };
  const model = genAI.getGenerativeModel(modelParams);

  const messageChunks = makeChunk(messages, 1000);
  const messagePrompts = messageChunks.map(convertMessagesToPrompt);

  let summarizationText: string | undefined;
  for (const messagePrompt of messagePrompts) {
    const generateContents: GenerateContentRequestContent[] = [];

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

    const geminiParams: GenerateContentRequest = {
      ...generateParams,
      contents: generateContents,
    };

    try {
      const result = await model.generateContent(geminiParams);

      const response = await result.response;
      if (logRequest !== undefined) {
        await logRequest(
          'google',
          modelName,
          { ...modelParams, ...geminiParams },
          response
        ).catch(e => logger.error(e));
      }
      const text = response.text();

      summarizationText = text;
    } catch (e) {
      if (logRequest !== undefined) {
        await logRequest(
          'google',
          modelName,
          { ...modelParams, ...geminiParams },
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

export const questionMessages = async (
  messages: MessageFromDatabase[],
  question: string,
  logRequest: LogAiRequest | undefined
): Promise<string | undefined> => {
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
  const modelParams: ModelParams = {
    model: modelName,
  };
  const generateParams: GenerateContentRequest = {
    contents: [
      { role: 'user', parts: [{ text: promptSystem }] },
      { role: 'user', parts: [{ text: messagePrompt }] },
      { role: 'user', parts: [{ text: `[Question] ${question}` }] },
    ],
    generationConfig: {
      temperature: 0.5 + Math.random() * 0.2,
    },
    safetySettings: unsafeSafetySettings,
    systemInstruction: promptSystem,
  };
  const model = genAI.getGenerativeModel(modelParams);

  try {
    const result = await model.generateContent(generateParams);

    const response = await result.response;
    if (logRequest !== undefined) {
      await logRequest(
        'google',
        modelName,
        { ...modelParams, ...generateParams },
        response
      ).catch(e => logger.error(e));
    }
    const text = response.text();
    const summarization = text.trim();
    return summarization + `\n(${modelName})`;
  } catch (e) {
    if (logRequest !== undefined) {
      await logRequest(
        'google',
        modelName,
        { ...modelParams, ...generateParams },
        e as object
      ).catch(e => logger.error(e));
    }
    throw e;
  }
};
