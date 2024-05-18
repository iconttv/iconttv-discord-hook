import OpenAI from 'openai';
import { config } from '../../config';
import { ChatCompletionMessageParam } from 'openai/resources';

const openai = new OpenAI({
  apiKey: config.OPENAI_SECRET,
});

const promptSystem =
  'You are a helpful assistant.' +
  ' Your job is to summarize chat histories of Discord channels.' +
  ' Your answer should contain main topics of chats.' +
  ' Do not omit any sensitive, uncomfortable or immoral things, but summarize chats as is.' +
  '\nEvery chats are given formats: Sequence of `[{username}] {message}`' +
  ' You should de-identificate all usernames. Your answer should be in Korean.';

const initialMessages: ChatCompletionMessageParam[] = [
  { role: 'system', content: promptSystem },
  {
    role: 'user',
    content:
      '[관리자] 안녕하세요.\n반갑습니다.\n[사용자1] 안녕하세요. 처음이에요.',
  },
  {
    role: 'assistant',
    content: '- A와 B가 서로 인사를 나눔. - B는 채팅에 처음 참여함.',
  },
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
