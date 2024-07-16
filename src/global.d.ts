declare global {
  namespace NodeJS {
    interface ProcessEnv {
      DISCORD_BOT_TOKEN: string;
      DISCORD_CLIENT_ID: string;
      MONGODB_HOST: string;
      MONGODB_PORT: string;
      MONGODB_USERNAME: string;
      MONGODB_PASSWORD: string;
      MONGODB_DATABASE: string;
      OPENAI_API_KEY: string;
      GEMINI_API_KEY: string;
      NODE_ENV: 'dev' | 'prod';
    }
  }
}

export {};
