import OpenAI from 'openai';
import { config } from '../../config';
import logger from '../../lib/logger';

type LogOpenaiRequest = (
  messageParam: OpenAI.ChatCompletionMessageParam[],
  modelName: string,
  params: object,
  response: object
) => Promise<void>;

const openai = new OpenAI({
  apiKey: config.OPENAI_SECRET,
});

export const summarizeMessages = async (
  messagePrompts: string[],
  logOpenaiRequest: LogOpenaiRequest | undefined
): Promise<string | undefined> => {
  const promptSystem = await fetch(
    `${config.GITHUB_BASEURL}/src/utils/llm/prompt-summarization.txt`
  )
    .then(res => res.text())
    .catch(e => {
      logger.error(e);
      throw e;
    });
  const model = 'gpt-3.5-turbo-0125';
  const requestOptions: Partial<OpenAI.ChatCompletionCreateParamsNonStreaming> =
    {
      frequency_penalty: 0.2,
      presence_penalty: -0.8,
      temperature: 0.2,
    };

  let summarization: string | undefined;
  for (const messagePrompt of messagePrompts) {
    const chatCompletionMessage: OpenAI.ChatCompletionMessageParam[] = [
      { role: 'system', content: promptSystem },
    ];

    if (summarization !== undefined && summarization.length > 0) {
      chatCompletionMessage.push({
        role: 'user',
        content: `[SUMM] ${summarization}`,
      });
    }
    chatCompletionMessage.push({
      role: 'user',
      content: messagePrompt,
    });

    const chatCompletion = await openai.chat.completions.create({
      messages: chatCompletionMessage,
      model,
      ...requestOptions,
    });

    if (logOpenaiRequest !== undefined) {
      await logOpenaiRequest(
        chatCompletionMessage,
        model,
        requestOptions,
        chatCompletion
      ).catch(e => logger.error(e));
    }

    if (!chatCompletion.choices[0].message.content) break;

    summarization = chatCompletion.choices[0].message.content.trim();
  }

  return summarization;
};

export const questionMessages = async (
  messagePrompt: string,
  question: string,
  logOpenaiRequest: LogOpenaiRequest | undefined
): Promise<string | undefined> => {
  const promptSystem = await fetch(
    `${config.GITHUB_BASEURL}/src/utils/llm/prompt-question.txt`
  )
    .then(res => res.text())
    .catch(e => {
      logger.error(e);
      throw e;
    });

  const model = 'gpt-3.5-turbo-0125';
  const requestOptions: Partial<OpenAI.ChatCompletionCreateParamsNonStreaming> =
    {
      frequency_penalty: 0.2,
      presence_penalty: -0.8,
      temperature: 0.2,
    };
  const chatCompletionMessage: OpenAI.ChatCompletionMessageParam[] = [
    { role: 'system', content: promptSystem },
    { role: 'user', content: messagePrompt },
    { role: 'user', content: `[Question] ${question}` },
  ];

  const chatCompletion = await openai.chat.completions.create({
    messages: chatCompletionMessage,
    model,
    ...requestOptions,
  });

  if (logOpenaiRequest !== undefined) {
    await logOpenaiRequest(
      chatCompletionMessage,
      model,
      requestOptions,
      chatCompletion
    ).catch(e => logger.error(e));
  }

  if (!chatCompletion.choices[0].message.content) return;

  return chatCompletion.choices[0].message.content.trim();
};
