import OpenAI from 'openai';
import { config } from '../../config';
import logger from '../../lib/logger';
import { makeChunk } from '../index';
import {
  constructSummarizationResult,
  convertMessagesToPrompt,
} from '../message';

import {
  QuestionMessageProps,
  SummarizeMessagesProps,
  SummarizeOutputSchemaOpenai,
} from './types';

const openai = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: config.OPENROUTER_API_KEY,
  defaultHeaders: {
    'HTTP-Referer': 'https://github.com/iconttv', // Optional. Site URL for rankings on openrouter.ai.
    'X-Title': 'iconttv-discord', // Optional. Site title for rankings on openrouter.ai.
  },
});

const models = config.OPENROUTER_LLM_MODELS.split(',')
  .map(model => model.trim())
  .filter(model => model.length > 0);

const getModel = () => {
  const idx = Math.floor(Math.random() * models.length);
  return models[idx];
};

const google_extra_body = {
  provider: {
    // use google-vertex to specify safety_settings
    ignore: ['Google AI Studio'],
  },
  google: {
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
  },
} as const;

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

  const messageChunks = makeChunk(messages, 600);
  const messagePrompts = messageChunks.map(convertMessagesToPrompt);

  const model = getModel();
  const requestOptions: Partial<OpenAI.ChatCompletionCreateParamsNonStreaming> =
    {
      frequency_penalty: 0.5 + Math.random() * 0.1,
      presence_penalty: -0.3 + Math.random() * 0.2,
      temperature: 0.5 + Math.random() * 0.2,
      response_format: {
        type: 'json_schema',
        json_schema: SummarizeOutputSchemaOpenai,
      },
    };

  let summarizationText: string | undefined;
  for (const messagePrompt of messagePrompts) {
    const chatCompletionMessage: OpenAI.ChatCompletionMessageParam[] = [
      {
        role: 'system',
        content: promptSystem
          .replace('{{ channelName }}', context?.channelName || '')
          .replace('{{ guildName }}', context?.guildName || '')
          .replace('{{ datetime }}', new Date().toLocaleString())
          .replace('{{ persona }}', promptPersona),
      },
    ];

    if (summarizationText !== undefined && summarizationText.length > 0) {
      chatCompletionMessage.push({
        role: 'system',
        content: summarizationText,
      });
    }
    chatCompletionMessage.push({
      role: 'system',
      content: messagePrompt,
    });
    chatCompletionMessage.push({
      role: 'user',
      content: 'Summarize given chats.',
    });

    const openaiParams = {
      messages: chatCompletionMessage,
      model,
      ...requestOptions,
    };

    if (model.startsWith('google/')) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (openaiParams as any).extra_body = google_extra_body;
    }

    const chatCompletion = await openai.chat.completions
      .create(openaiParams)
      .then(async res => {
        if (logRequest !== undefined) {
          await logRequest('openai', model, openaiParams, res).catch(e =>
            logger.error(e)
          );
        }
        return res;
      })
      .catch(async e => {
        if (logRequest !== undefined) {
          await logRequest('openai', model, openaiParams, e).catch(e =>
            logger.error(e)
          );
        }
        throw e;
      });

    if (!chatCompletion.choices[0].message.content) break;
    summarizationText = chatCompletion.choices[0].message.content;
  }

  const summarization = constructSummarizationResult(
    guildId,
    channelId,
    summarizationText
  );

  return summarization + `\n(${model})`;
};

export const questionMessages = async ({
  messages,
  question,
  logRequest,
  skipSystemPrompt,
}: QuestionMessageProps): Promise<string | undefined> => {
  const promptSystem = skipSystemPrompt
    ? ''
    : await fetch(`${config.GITHUB_BASEURL}/src/utils/llm/prompt-question.txt`)
        .then(res => res.text())
        .catch(e => {
          logger.error(e);
          throw e;
        });

  const messagePrompt = convertMessagesToPrompt(messages);

  const model = getModel();
  const requestOptions: Partial<OpenAI.ChatCompletionCreateParamsNonStreaming> =
    {
      frequency_penalty: 0.5 + Math.random() * 0.1,
      presence_penalty: -0.3 + Math.random() * 0.2,
      temperature: 0.5 + Math.random() * 0.2,
    };
  const chatCompletionMessage: OpenAI.ChatCompletionMessageParam[] = [
    {
      role: 'system',
      content: promptSystem.replace(
        '{{ datetime }}',
        new Date().toLocaleString()
      ),
    },
    { role: 'system', content: messagePrompt },
    { role: 'user', content: question },
  ];

  const openaiParams = {
    messages: chatCompletionMessage,
    model,
    ...requestOptions,
  };

  if (model.startsWith('google/')) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (openaiParams as any).extra_body = google_extra_body;
  }

  const chatCompletion = await openai.chat.completions
    .create(openaiParams)
    .then(async res => {
      if (logRequest !== undefined) {
        await logRequest('openai', model, openaiParams, res).catch(e =>
          logger.error(e)
        );
      }
      return res;
    })
    .catch(async e => {
      if (logRequest !== undefined) {
        await logRequest('openai', model, openaiParams, e).catch(e =>
          logger.error(e)
        );
      }
      throw e;
    });

  if (!chatCompletion.choices[0].message.content) return;

  return chatCompletion.choices[0].message.content.trim() + `\n(${model})`;
};
