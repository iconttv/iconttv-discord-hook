import {
  questionMessages as openaiQuestionMessages,
  summarizeMessages as openaiSummarizeMessages,
} from './openai';

import {
  questionMessages as geminiQuestionMessages,
  summarizeMessages as geminiSummarizeMessages,
} from './gemini';
import { SummarizeMessagesProps, QuestionMessageProps } from './types';
import { config } from '../../config';

const useOpenai = () => Math.random() < config.LLM_OPENAI_PROB;

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
