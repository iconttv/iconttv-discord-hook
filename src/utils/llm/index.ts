import {
  questionMessages as openaiQuestionMessages,
  summarizeMessages as openaiSummarizeMessages,
} from './openai';

import {
  questionMessages as geminiQuestionMessages,
  summarizeMessages as geminiSummarizeMessages,
} from './gemini';
import { SummarizeMessagesProps, QuestionMessageProps } from './types';

const useOpenai = () => Math.random() < 0.7;

export const summarizeMessages = (props: SummarizeMessagesProps) => {
  const summarizer = useOpenai()
    ? openaiSummarizeMessages
    : geminiSummarizeMessages;

  return summarizer(props);
};

export const questionMessages = (props: QuestionMessageProps) => {
  const quentioner = useOpenai()
    ? openaiQuestionMessages
    : geminiQuestionMessages;

  return quentioner(props);
};
