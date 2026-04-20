export interface OpenRouterTrace {
  trace_id: string;
  trace_name: string;
  span_name: string;
  generation_name: string;
}

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
