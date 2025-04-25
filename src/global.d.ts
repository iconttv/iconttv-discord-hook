declare global {
  namespace NodeJS {
    interface ProcessEnv {
      WEBHOOK_DISCORD: string;
      DISCORD_BOT_TOKEN: string;
      DISCORD_CLIENT_ID: string;
      MONGODB_HOST: string;
      MONGODB_PORT: string;
      MONGODB_USERNAME: string;
      MONGODB_PASSWORD: string;
      MONGODB_DATABASE: string;
      OPENAI_API_KEY: string;
      GEMINI_API_KEY: string;
      NOVELAI_API_KEY: string;
      NODE_ENV: 'dev' | 'prod';
      ELASTIC_HOST: string;
      ELASTIC_API: string;
      EMBEDDING_CUSTOM_API_HOST: string;
      EMBEDDING_CUSTOM_API_AUTH_HEADER: string;
    }
  }
}

export {};
