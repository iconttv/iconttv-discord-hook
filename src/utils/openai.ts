import logger from '../lib/logger';

export interface OpenRouterTrace {
  trace_id: string;
  trace_name: string;
  span_name: string;
  generation_name: string;
}

export interface OpenRouterReasoning {
  exclude: true;
}

export const stripReasoningText = (text: string): string => {
  const tags = /<\/?(think|thinking|reasoning)\b[^>]*>/gi;
  const parts: string[] = [];
  const stack: string[] = [];
  let cursor = 0;
  let reasoningStart = 0;
  let match: RegExpExecArray | null;

  while ((match = tags.exec(text)) !== null) {
    if (stack.length === 0) {
      parts.push(text.slice(cursor, match.index));
      reasoningStart = match.index;
    }
    const name = match[1].toLowerCase();
    if (match[0].startsWith('</')) {
      if (stack[stack.length - 1] === name) stack.pop();
    } else if (!match[0].endsWith('/>')) {
      stack.push(name);
    }
    if (stack.length === 0) {
      logger.debug(`Removed reasoning block: ${text.slice(reasoningStart, tags.lastIndex)}`);
    }
    cursor = tags.lastIndex;
  }

  if (stack.length === 0) {
    parts.push(text.slice(cursor));
  } else {
    logger.debug(`Removed reasoning block: ${text.slice(reasoningStart)}`);
  }
  return parts.join('').trim();
};

export const getChatCompletionText = (
  message: { content?: unknown } | undefined
): string | undefined => {
  const content = message?.content;
  const text =
    typeof content === 'string'
      ? content
      : Array.isArray(content)
        ? content
            .map(part => {
              if (
                part &&
                typeof part === 'object' &&
                (part.type === 'text' || part.type === 'output_text') &&
                typeof part.text === 'string'
              ) {
                return part.text;
              }
              return '';
            })
            .join('')
        : '';

  return stripReasoningText(text) || undefined;
};

const OPENROUTER_HOSTNAME = 'openrouter.ai';
const OPENROUTER_REFERER = 'https://github.com/iconttv';

const OPENAI_COMPATIBLE_PROVIDER = 'openai-compatible';

export const isOpenRouterBaseUrl = (
  baseURL: string | undefined
): boolean => {
  if (!baseURL) {
    return false;
  }

  try {
    return new URL(baseURL).hostname === OPENROUTER_HOSTNAME;
  } catch {
    return false;
  }
};

export const getOpenRouterHeaders = (
  baseURL: string | undefined,
  title: string
): Record<string, string> | undefined => {
  if (!isOpenRouterBaseUrl(baseURL)) {
    return undefined;
  }

  return {
    'HTTP-Referer': OPENROUTER_REFERER,
    'X-Title': title,
  };
};

export const getOpenAiProviderName = (
  baseURL: string | undefined
): string => {
  if (!baseURL) {
    return OPENAI_COMPATIBLE_PROVIDER;
  }

  try {
    const { hostname } = new URL(baseURL);
    return hostname === OPENROUTER_HOSTNAME
      ? 'openrouter'
      : hostname || OPENAI_COMPATIBLE_PROVIDER;
  } catch {
    return OPENAI_COMPATIBLE_PROVIDER;
  }
};

export const parseOpenAiModelList = (
  models: string,
  envVarName: string
): string[] => {
  const parsedModels = models
    .split(',')
    .map(model => model.trim())
    .filter(model => model.length > 0);

  if (parsedModels.length === 0) {
    throw new Error(`${envVarName} must include at least one model.`);
  }

  return parsedModels;
};

export const buildOpenAiRequestUrl = (
  baseURL: string,
  path: string
): string => {
  const normalizedBaseURL = baseURL.endsWith('/') ? baseURL : `${baseURL}/`;
  const normalizedPath = path.startsWith('/') ? path.slice(1) : path;

  return new URL(normalizedPath, normalizedBaseURL).toString();
};
