import OpenAI from 'openai';
import { config } from '../../config';
import logger from '../../lib/logger';
import { makeChunk } from '../index';
import {
  getOpenAiProviderName,
  getOpenRouterHeaders,
  isOpenRouterBaseUrl,
  OpenRouterTrace,
  parseOpenAiModelList,
} from '../openai';
import {
  constructQuestionResult,
  constructSummarizationResult,
  convertMessagesToPrompt,
} from '../message';

import {
  QuestionMessageProps,
  questionOutputSchemaOpenai,
  SummarizeMessagesProps,
  SummarizeOutputSchemaOpenai,
} from './types';

const llmBaseURL = config.LLM_OPENAI_BASEURL;
const llmDefaultHeaders = getOpenRouterHeaders(llmBaseURL, 'iconttv-discord');
const isOpenRouterLlm = isOpenRouterBaseUrl(llmBaseURL);
const providerName = getOpenAiProviderName(llmBaseURL);

const openai = new OpenAI({
  baseURL: llmBaseURL,
  apiKey: config.LLM_OPENAI_API_KEY,
  ...(llmDefaultHeaders ? { defaultHeaders: llmDefaultHeaders } : {}),
  timeout: 60 * 1000,
});

const models = parseOpenAiModelList(
  config.LLM_OPENAI_MODELS,
  'LLM_OPENAI_MODELS'
);

const getModel = () => {
  const idx = Math.floor(Math.random() * models.length);
  return models[idx];
};

const googleExtraBody = {
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

type OpenRouterChatCompletionCreateParams =
  OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming & {
    extra_body?: typeof googleExtraBody;
    trace?: OpenRouterTrace;
  };

export const summarizeMessages = async ({
  messages,
  guildId,
  channelId,
  logRequest,
  context,
}: SummarizeMessagesProps): Promise<string | undefined> => {
  const promptSystemPromise = fetch(
    `${config.GITHUB_BASEURL}/static/prompt-summarization.txt`
  )
    .then(res => res.text())
    .catch(e => {
      logger.error(e);
      throw e;
    });
  const promptPersonaPromise = fetch(
    `${config.GITHUB_BASEURL}/static/prompt-persona.txt`
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
  const requestOptions: Partial<OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming> =
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
      role: 'user',
      content: messagePrompt,
    });
    chatCompletionMessage.push({
      role: 'user',
      content: 'Summarize given chats.',
    });

    const openaiParams: OpenRouterChatCompletionCreateParams = {
      messages: chatCompletionMessage,
      model,
      ...requestOptions,
    };

    if (isOpenRouterLlm) {
      openaiParams.trace = {
        trace_id: `${guildId}_${channelId}_${context?.messageId}`,
        trace_name: 'Chat Summarization',
        span_name: 'Summarization Step',
        generation_name: 'Generate Summary',
      };

      if (model.startsWith('google/')) {
        openaiParams.extra_body = googleExtraBody;
      }
    }

    const chatCompletion = await openai.chat.completions
      .create(openaiParams)
      .then(async res => {
        if (logRequest !== undefined) {
          await logRequest(providerName, model, openaiParams, res).catch(e =>
            logger.error(e)
          );
        }
        return res;
      })
      .catch(async e => {
        if (logRequest !== undefined) {
          await logRequest(providerName, model, openaiParams, e).catch(e =>
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
  guildId,
  channelId,
  messages,
  question,
  logRequest,
  skipSystemPrompt,
  context,
}: QuestionMessageProps): Promise<string | undefined> => {
  const promptSystem = skipSystemPrompt
    ? ''
    : await fetch(`${config.GITHUB_BASEURL}/static/prompt-question.txt`)
        .then(res => res.text())
        .catch(e => {
          logger.error(e);
          throw e;
        });

  const messagePrompt = convertMessagesToPrompt(messages);

  const model = getModel();
  const requestOptions: Partial<OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming> =
    {
      frequency_penalty: 0.5 + Math.random() * 0.1,
      presence_penalty: -0.3 + Math.random() * 0.2,
      temperature: 0.5 + Math.random() * 0.2,
      response_format: {
        type: 'json_schema',
        json_schema: questionOutputSchemaOpenai,
      },
    };
  const chatCompletionMessage: OpenAI.ChatCompletionMessageParam[] = [
    {
      role: 'system',
      content: promptSystem
        .replace('{{ channelName }}', context?.channelName || '')
        .replace('{{ guildName }}', context?.guildName || '')
        .replace('{{ datetime }}', new Date().toLocaleString()),
    },
    { role: 'user', content: messagePrompt },
    { role: 'user', content: question },
  ];

  const openaiParams: OpenRouterChatCompletionCreateParams = {
    messages: chatCompletionMessage,
    model,
    ...requestOptions,
  };

  if (isOpenRouterLlm) {
    openaiParams.trace = {
        trace_id: `${guildId}_${channelId}_${context?.messageId}`,
        trace_name: 'Question',
        span_name: 'Question Step',
        generation_name: 'Generate Answer',
      };

    if (model.startsWith('google/')) {
      openaiParams.extra_body = googleExtraBody;
    }
  }

  const chatCompletion = await openai.chat.completions
    .create(openaiParams)
    .then(async res => {
      if (logRequest !== undefined) {
        await logRequest(providerName, model, openaiParams, res).catch(e =>
          logger.error(e)
        );
      }
      return res;
    })
    .catch(async e => {
      if (logRequest !== undefined) {
        await logRequest(providerName, model, openaiParams, e).catch(e =>
          logger.error(e)
        );
      }
      throw e;
    });

  if (!chatCompletion.choices[0].message.content) return;

  const answer = constructQuestionResult(
    guildId,
    channelId,
    chatCompletion.choices[0].message.content.trim()
  );

  return answer + `\n(${model})`;
};
