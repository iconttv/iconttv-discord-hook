import * as dotenv from 'dotenv';
import logger from './lib/logger';
import { existsSync } from 'fs';

interface Config {
  WEBHOOK_DISCORD: string;
  DISCORD_BOT_TOKEN: string;
  DISCORD_CLIENT_ID: string;
  MONGODB_HOST: string;
  MONGODB_PORT: string;
  MONGODB_USERNAME: string;
  MONGODB_PASSWORD: string;
  MONGODB_DATABASE: string;

  LLM_OPENAI_PROB: number;
  OPENAI_API_BASEURL: string | undefined;
  OPENAI_API_KEY: string | undefined;
  OPENAI_API_MODEL: string;
  IMAGE_OPENAI_API_KEY: string | undefined;

  GEMINI_API_KEY: string | undefined;

  NOVELAI_API_KEY: string | undefined;
  ELASTIC_HOST: string | undefined;
  ELASTIC_API: string | undefined;

  EMBEDDING_CUSTOM_API_HOST: string | undefined;
  EMBEDDING_CUSTOM_API_AUTH_HEADER: string | undefined;

  ENV: 'prod' | 'dev';
  GITHUB_BASEURL: string;

  CACHE_CLEAR_CHECK_TIME_MS: number;
}

const envFilePath = process.env.NODE_ENV === 'prod' ? '.env' : '.env.dev';

if (existsSync(envFilePath)) {
  const env = dotenv.config({
    path: process.env.NODE_ENV === 'prod' ? '.env' : '.env.dev',
  });

  if (env.error || !env.parsed) {
    logger.error(env.error);
  }
}

export const config: Config = {
  WEBHOOK_DISCORD: process.env.WEBHOOK_DISCORD!,
  DISCORD_BOT_TOKEN: process.env.DISCORD_BOT_TOKEN!,
  DISCORD_CLIENT_ID: process.env.DISCORD_CLIENT_ID!,
  MONGODB_HOST: process.env.MONGODB_HOST!,
  MONGODB_PORT: process.env.MONGODB_PORT!,
  MONGODB_USERNAME: process.env.MONGODB_USERNAME!,
  MONGODB_PASSWORD: process.env.MONGODB_PASSWORD!,
  MONGODB_DATABASE: process.env.MONGODB_DATABASE!,

  LLM_OPENAI_PROB:
    Number.parseFloat(process.env.LLM_OPENAI_PROB) === undefined
      ? 0.7
      : Number.parseFloat(process.env.LLM_OPENAI_PROB),
  OPENAI_API_BASEURL: process.env.OPENAI_API_BASEURL,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  OPENAI_API_MODEL: process.env.OPENAI_API_MODEL,
  IMAGE_OPENAI_API_KEY: process.env.IMAGE_OPENAI_API_KEY,

  GEMINI_API_KEY: process.env.GEMINI_API_KEY,

  NOVELAI_API_KEY: process.env.NOVELAI_API_KEY,
  ENV: process.env.NODE_ENV === 'prod' ? 'prod' : 'dev',
  GITHUB_BASEURL: `https://raw.githubusercontent.com/iconttv/iconttv-discord-hook/${
    process.env.NODE_ENV === 'prod' ? 'main' : 'develop'
  }`,
  ELASTIC_HOST: process.env.ELASTIC_HOST,
  ELASTIC_API: process.env.ELASTIC_API,

  EMBEDDING_CUSTOM_API_HOST: process.env.EMBEDDING_CUSTOM_API_HOST,
  EMBEDDING_CUSTOM_API_AUTH_HEADER:
    process.env.EMBEDDING_CUSTOM_API_AUTH_HEADER,

  CACHE_CLEAR_CHECK_TIME_MS: 10 * 60 * 1000,
};
