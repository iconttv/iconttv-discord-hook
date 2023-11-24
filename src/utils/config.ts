import * as dotenv from 'dotenv';
import logger from '../lib/logger';
import { exit } from 'process';

interface Config {
  DISCORD_BOT_TOKEN: string;
  DISCORD_CLIENT_ID: string;
  SQLITE3_FILE: string;
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
  SQLITE3_FILE: env.parsed.SQLITE3_FILE,
};
