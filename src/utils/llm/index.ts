import {
  questionMessages as openRouterQuestionMessages,
  summarizeMessages as openRouterSummarizeMessages,
} from './openrouter';

import { SummarizeMessagesProps, QuestionMessageProps } from './types';

export const summarizeMessages = (props: SummarizeMessagesProps) => {
  return openRouterSummarizeMessages(props);
};

export const questionMessages = (props: QuestionMessageProps) => {
  return openRouterQuestionMessages(props);
};
