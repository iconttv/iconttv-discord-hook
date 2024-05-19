import OpenAI from 'openai';
import { config } from '../../config';
import logger from '../../lib/logger';

const openai = new OpenAI({
  apiKey: config.OPENAI_SECRET,
});

export const summarizeMessages = async (
  messagePrompts: string[]
): Promise<string | undefined> => {
  const promptSystem = await fetch(
    `${config.GITHUB_BASEURL}/src/utils/llm/prompt-summarization.txt`
  )
    .then(res => res.text())
    .catch(e => {
      logger.error(e);
      throw e;
    });

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
      model: 'gpt-3.5-turbo-0125',
    });

    if (!chatCompletion.choices[0].message.content) break;

    summarization = chatCompletion.choices[0].message.content.trim();
    logger.debug(`temporal summarization: ${summarization}`);
  }

  return summarization;
};

export const questionMessages = async (
  messagePrompt: string,
  question: string
): Promise<string | undefined> => {
  const promptSystem = await fetch(
    `${config.GITHUB_BASEURL}/src/utils/llm/prompt-question.txt`
  )
    .then(res => res.text())
    .catch(e => {
      logger.error(e);
      throw e;
    });

  const chatCompletion = await openai.chat.completions.create({
    messages: [
      { role: 'system', content: promptSystem },
      { role: 'user', content: messagePrompt },
      { role: 'user', content: `[Question] ${question}` },
    ],
    model: 'gpt-3.5-turbo-0125',
  });

  if (!chatCompletion.choices[0].message.content) return;

  return chatCompletion.choices[0].message.content.trim();
};
