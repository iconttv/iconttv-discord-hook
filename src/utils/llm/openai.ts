import OpenAI from 'openai';
import { config } from '../../config';
import logger from '../../lib/logger';
import { LogAiRequest, MessageFromDatabase } from '../../type';
import { makeChunk } from '..';
import { convertMessagesToPrompt } from '../message';

const openai = new OpenAI({
  apiKey: config.OPENAI_API_KEY,
});

const GPT35_PROB = 0.4;

const getModel = () =>
  Math.random() < GPT35_PROB ? 'gpt-3.5-turbo' : 'gpt-4o';

export const summarizeMessages = async (
  messages: MessageFromDatabase[],
  logOpenaiRequest: LogAiRequest | undefined
): Promise<string | undefined> => {
  const promptSystem = await fetch(
    `${config.GITHUB_BASEURL}/src/utils/llm/prompt-summarization.txt`
  )
    .then(res => res.text())
    .catch(e => {
      logger.error(e);
      throw e;
    });

  const messageChunks = makeChunk(messages, 500);
  const messagePrompts = messageChunks.map(convertMessagesToPrompt);

  const model = getModel();
  const requestOptions: Partial<OpenAI.ChatCompletionCreateParamsNonStreaming> =
    {
      frequency_penalty: 0.5 + Math.random() * 0.1,
      presence_penalty: -0.3 + Math.random() * 0.2,
      temperature: 0.5 + Math.random() * 0.2,
    };

  let summarization: string | undefined;
  for (const messagePrompt of messagePrompts) {
    const chatCompletionMessage: OpenAI.ChatCompletionMessageParam[] = [
      { role: 'system', content: promptSystem },
    ];

    if (summarization !== undefined && summarization.length > 0) {
      chatCompletionMessage.push({
        role: 'user',
        content: summarization,
      });
    }
    chatCompletionMessage.push({
      role: 'user',
      content: messagePrompt,
    });

    const openaiParams = {
      messages: chatCompletionMessage,
      model,
      ...requestOptions,
    };
    const chatCompletion = await openai.chat.completions
      .create(openaiParams)
      .then(async res => {
        if (logOpenaiRequest !== undefined) {
          await logOpenaiRequest('openai', model, openaiParams, res).catch(e =>
            logger.error(e)
          );
        }
        return res;
      })
      .catch(async e => {
        if (logOpenaiRequest !== undefined) {
          await logOpenaiRequest('openai', model, openaiParams, e).catch(e =>
            logger.error(e)
          );
        }
        throw e;
      });

    if (!chatCompletion.choices[0].message.content) break;

    summarization = chatCompletion.choices[0].message.content
      .trim()
      .replace('[SUMM]', '')
      .replace('[REVIEW]', '')
      .replace('한줄평:', '');
  }

  return summarization + `\n(${model})`;
};

export const questionMessages = async (
  messages: MessageFromDatabase[],
  question: string,
  logOpenaiRequest: LogAiRequest | undefined
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

  const model = getModel();
  const requestOptions: Partial<OpenAI.ChatCompletionCreateParamsNonStreaming> =
    {
      frequency_penalty: 0.5 + Math.random() * 0.1,
      presence_penalty: -0.3 + Math.random() * 0.2,
      temperature: 0.5 + Math.random() * 0.2,
    };
  const chatCompletionMessage: OpenAI.ChatCompletionMessageParam[] = [
    { role: 'system', content: promptSystem },
    { role: 'user', content: messagePrompt },
    { role: 'user', content: `[Question] ${question}` },
  ];

  const openaiParams = {
    messages: chatCompletionMessage,
    model,
    ...requestOptions,
  };
  const chatCompletion = await openai.chat.completions
    .create(openaiParams)
    .then(async res => {
      if (logOpenaiRequest !== undefined) {
        await logOpenaiRequest('openai', model, openaiParams, res).catch(e =>
          logger.error(e)
        );
      }
      return res;
    })
    .catch(async e => {
      if (logOpenaiRequest !== undefined) {
        await logOpenaiRequest('openai', model, openaiParams, e).catch(e =>
          logger.error(e)
        );
      }
      throw e;
    });

  if (!chatCompletion.choices[0].message.content) return;

  return chatCompletion.choices[0].message.content.trim() + `\n(${model})`;
};
