import * as dotenv from 'dotenv';
import logger from './lib/logger.js';
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
  OPENAI_API_KEY: string | undefined;
  GEMINI_API_KEY: string | undefined;
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
  WEBHOOK_DISCORD: process.env.WEBHOOK_DISCORD,
  DISCORD_BOT_TOKEN: process.env.DISCORD_BOT_TOKEN,
  DISCORD_CLIENT_ID: process.env.DISCORD_CLIENT_ID,
  MONGODB_HOST: process.env.MONGODB_HOST!,
  MONGODB_PORT: process.env.MONGODB_PORT!,
  MONGODB_USERNAME: process.env.MONGODB_USERNAME,
  MONGODB_PASSWORD: process.env.MONGODB_PASSWORD,
  MONGODB_DATABASE: process.env.MONGODB_DATABASE,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  GEMINI_API_KEY: process.env.GEMINI_API_KEY,
  ENV: process.env.NODE_ENV === 'prod' ? 'prod' : 'dev',
  GITHUB_BASEURL: `https://raw.githubusercontent.com/iconttv/iconttv-discord-hook/${
    process.env.NODE_ENV === 'prod' ? 'main' : 'develop'
  }`,

  CACHE_CLEAR_CHECK_TIME_MS: 10 * 60 * 1000,
};
