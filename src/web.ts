import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import mongoose from 'mongoose';
import { config } from './config';
import logger from './lib/logger';
import { createWebServer } from './web/app';
import { formatWebError } from './web/diagnostics';
import {
  findWebSession,
  getWebConfiguration,
} from './service/webSessionService';
import { searchWebMessages } from './service/webSearchService';
import { scheduleWebSessionCleanup } from './service/webSessionCleanupService';
import {
  getGuildSettingById,
  setGuildSettingById,
} from './service/settingService';

let startupStage = 'web configuration';
const secrets = Object.entries(config)
  .filter(([key]) => /PASSWORD|TOKEN|SECRET|API_KEY|ELASTIC_API/.test(key))
  .map(([, value]) => (typeof value === 'string' ? value : undefined));

const main = async () => {
  const { origin } = getWebConfiguration();
  const port = Number(config.WEB_PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error('Invalid WEB_PORT.');
  const assets = existsSync(resolve(__dirname, 'public/index.html'))
    ? resolve(__dirname, 'public')
    : resolve(__dirname, '../web');
  const user = encodeURIComponent(config.MONGODB_USERNAME);
  const password = encodeURIComponent(config.MONGODB_PASSWORD);
  startupStage = 'MongoDB connection';
  await mongoose.connect(
    `mongodb://${user}:${password}@${config.MONGODB_HOST}:${config.MONGODB_PORT}/${config.MONGODB_DATABASE}?authSource=admin`,
    {
      dbName: config.MONGODB_DATABASE,
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 10000,
    }
  );
  scheduleWebSessionCleanup();
  let stopping = false;
  const server = createWebServer({
    origin,
    assets,
    isHealthy: () => !stopping && mongoose.connection.readyState === 1,
    findSession: findWebSession,
    search: searchWebMessages,
    getSettings: async guildId => {
      const setting = await getGuildSettingById(guildId);
      return {
        enableFeatureIconImageResize:
          setting?.enableFeatureIconImageResize ?? false,
        enableCommandQuestionForEveryone:
          setting?.enableCommandQuestionForEveryone ?? false,
      };
    },
    saveSettings: setGuildSettingById,
    onError: error =>
      logger.error(`Web request failed: ${formatWebError(error, secrets)}`),
  });
  const stop = () => {
    if (stopping) return;
    stopping = true;
    const timer = setTimeout(() => {
      server.closeAllConnections();
    }, 15000).unref();
    server.close(() => {
      clearTimeout(timer);
      void mongoose.disconnect().catch(() => {
        process.exitCode = 1;
      });
    });
  };
  process.once('SIGTERM', stop);
  process.once('SIGINT', stop);
  startupStage = 'HTTP listener';
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, config.WEB_HOST, resolve);
  });
  logger.info(`Discord web listening on ${config.WEB_HOST}:${port}`);
};

void main().catch(error => {
  logger.error(
    `Web startup failed [${startupStage}]: ${formatWebError(error, secrets)}`
  );
  process.exitCode = 1;
  void mongoose.disconnect();
});
