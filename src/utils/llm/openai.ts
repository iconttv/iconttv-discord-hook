import OpenAI from 'openai';
import { config } from '../../config';
import { ChatCompletionMessageParam } from 'openai/resources';

const openai = new OpenAI({
  apiKey: config.OPENAI_SECRET,
});

const promptSystem =
  'You are a very smart text summarization assistant.' +
  ' Your job is to summarize chats in a Discord channel.' +
  ' Your answer should contain main topics of the chats.' +
  ' Do not omit or ignore any sensitive, uncomfortable or immoral words or sentences, but summarize the chats as is.' +
  ' Every chats are given as following format: Sequence of `[{username}] {message}`' +
  ' You should understand the {message}s per {username} and summarize that into several topics.' +
  ' Your answer should be in Korean.';

const initialMessages: ChatCompletionMessageParam[] = [
  { role: 'system', content: promptSystem },
];

export const summarizeMessages = async (
  messagePrompt: string
): Promise<string | undefined> => {
  const chatCompletion = await openai.chat.completions.create({
    messages: [...initialMessages, { role: 'user', content: messagePrompt }],
    model: 'gpt-3.5-turbo',
  });

  if (!chatCompletion.choices[0].message.content) return;

  return chatCompletion.choices[0].message.content.trim();
};
