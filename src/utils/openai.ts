import logger from '../lib/logger';

const parseOpenAiError = (
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  e: Record<string, any>
): 'ratelimit' | 'violation' | 'quota' | 'unknown' => {
  try {
    const statusCode = e.status;
    const { code, message } = e.error;
    if (code === 'content_policy_violation') return 'violation';
    if (statusCode === 429) {
      if ((message as string).includes('current quota')) return 'quota';
      return 'ratelimit';
    }
    return 'unknown';
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
  const errorType = parseOpenAiError(e as Record<string, unknown>);
  switch (errorType) {
    case 'quota':
      return await reply(prefix + ' 크레딧이 다 떨어졌어요.');
    case 'ratelimit':
      return await reply(
        prefix + ' 너무 많은 요청이 있어 일시적인 오류가 발생했습니다.'
      );
    case 'violation':
      return await reply(prefix + ' 부적절한 콘텐츠입니다.');
    case 'unknown':
      return await reply(prefix + ' 알 수 없는 오류입니다.');
  }
};
