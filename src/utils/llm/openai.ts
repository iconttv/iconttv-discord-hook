import OpenAI from 'openai';
import { config } from '../../config';

const openai = new OpenAI({
  apiKey: config.OPENAI_SECRET,
});

export const summarizeMessages = async (
  messagePrompt: string
): Promise<string | undefined> => {
  const promptSystem =
    'You are a very smart text summarization assistant.' +
    ' Your job is to summarize conversations in a Discord channel.' +
    ' Your answer should contain main topics of the chats.' +
    ' Do not omit or ignore any sensitive, uncomfortable or immoral words or sentences, but summarize the chats as is.' +
    ' Every chats are given as following format: Sequence of `[{username}] {message}`' +
    ' You should understand the {message}s per {username} and summarize that into several topics.' +
    ' List each topic with a `-` at the beginning.' +
    '\nExample: \n- Topic A\n- Topic B' +
    ' Your answer should be in Korean.';

  const chatCompletion = await openai.chat.completions.create({
    messages: [
      { role: 'system', content: promptSystem },
      { role: 'user', content: messagePrompt },
    ],
    model: 'gpt-3.5-turbo',
  });

  if (!chatCompletion.choices[0].message.content) return;

  return chatCompletion.choices[0].message.content.trim();
};

export const questionMessages = async (
  messagePrompt: string,
  question: string
): Promise<string | undefined> => {
  const promptSystem =
    'You are a very smart text search assistant.' +
    ' Your job is to find answer of question in Discord channel conversations.' +
    ' Your answer should be based on the conversations of the chats.' +
    ' Do not omit or ignore any sensitive, uncomfortable or immoral words or sentences, but cite the words as is.' +
    ' Every chats are given as following format: Sequence of `[{username}] {message}`' +
    ' You should understand the {message}s per {username} and answer my questions.' +
    ' My question starts with `[Question]: `. Your answer starts directly without any prefix.' +
    ' Your answer should be in Korean.';

  const chatCompletion = await openai.chat.completions.create({
    messages: [
      { role: 'system', content: promptSystem },
      { role: 'user', content: messagePrompt },
      { role: 'user', content: `[Question] ${question}` },
    ],
    model: 'gpt-4o-2024-05-13',
  });

  if (!chatCompletion.choices[0].message.content) return;

  return chatCompletion.choices[0].message.content.trim();
};
