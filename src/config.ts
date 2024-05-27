import * as dotenv from 'dotenv';
import logger from './lib/logger';
import { exit } from 'process';

interface Config {
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
}

const env = dotenv.config({
  path: process.env.NODE_ENV === 'prod' ? '.env' : '.env.dev',
});

if (env.error || !env.parsed) {
  logger.error(env.error);
  exit(1);
}

export const config: Config = {
  DISCORD_BOT_TOKEN: env.parsed.DISCORD_BOT_TOKEN,
  DISCORD_CLIENT_ID: env.parsed.DISCORD_CLIENT_ID,
  MONGODB_HOST: env.parsed.MONGODB_HOST,
  MONGODB_PORT: env.parsed.MONGODB_PORT,
  MONGODB_USERNAME: env.parsed.MONGODB_USERNAME,
  MONGODB_PASSWORD: env.parsed.MONGODB_PASSWORD,
  MONGODB_DATABASE: env.parsed.MONGODB_DATABASE,
  OPENAI_API_KEY: env.parsed.OPENAI_API_KEY,
  GEMINI_API_KEY: env.parsed.GEMINI_API_KEY,
  ENV: process.env.NODE_ENV === 'prod' ? 'prod' : 'dev',
  GITHUB_BASEURL: `https://raw.githubusercontent.com/iconttv/iconttv-discord-hook/${
    process.env.NODE_ENV === 'prod' ? 'main' : 'develop'
  }`,
};
