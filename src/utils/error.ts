import OpenAi from 'openai';
import { GoogleGenerativeAIError } from '@google/generative-ai';
import logger from '../lib/logger';

const parseGoogleError = (
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars
  e: Record<string, any>
) => {
  return `알 수 없는 오류입니다.`;
};

const parseOpenaiError = (
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  e: Record<string, any>
): string => {
  try {
    const statusCode = e.status;
    const { code, message } = e.error;

    if (statusCode === 429) {
      if ((message as string).includes('current quota'))
        return '너무 많은 요청이 있어 일시적인 오류가 발생했습니다.';
    }
    if (statusCode === 400) {
      if (code === 'content_policy_violation') return '부적절한 콘텐츠입니다.';
      if (code === 'billing_hard_limit_reached') return '돈이 다 떨어졌어요.';
    }

    return `알 수 없는 오류입니다. (${code})`;
  } catch (_e) {
    logger.error(_e);
    throw e;
  }
};

export const replyMessagePerError = async (
  e: unknown,
  prefix: string,
  reply: (_: string) => unknown
) => {
  const errorMessage = (() => {
    if (e instanceof OpenAi.APIError) {
      return parseOpenaiError(e);
    }
    if (e instanceof GoogleGenerativeAIError) {
      return parseGoogleError(e);
    }
    return `알 수 없는 오류입니다.`;
  })();

  await reply(`${prefix} ${errorMessage}`);
};
