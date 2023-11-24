declare global {
  namespace NodeJS {
    interface ProcessEnv {
      DISCORD_BOT_TOKEN: string;
      DISCORD_CLIENT_ID: string;
      NODE_ENV: 'dev' | 'prod';
      SQLITE3_FILE: string;
    }
  }
}

export {};
