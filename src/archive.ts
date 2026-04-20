import mongoose from 'mongoose';
import client from './lib/discord';
import { registerEventsArchive } from './controller/archive/index';
import { config } from './config';
import { createMongooseConnection } from './database/index';
import logger from './lib/logger';
import {
  requestArchiveShutdown,
  waitForTrackedArchiveWork,
} from './service/archive/lifecycle';
import { getKafkaProducer } from './service/kafkaService';

(async () => {
  await Promise.all([
    createMongooseConnection(),
    registerEventsArchive(client),
  ]);

  client.login(config.DISCORD_BOT_TOKEN);

  let shutdownPromise: Promise<void> | null = null;

  const shutdown = async (reason: string, exitCode: number) => {
    if (!shutdownPromise) {
      shutdownPromise = (async () => {
        logger.info(`Archive shutdown requested: ${reason}`);
        requestArchiveShutdown();
        await waitForTrackedArchiveWork();

        client.destroy();

        await mongoose.disconnect();

        const kafkaProducer = await getKafkaProducer();
        if (kafkaProducer) {
          await kafkaProducer.disconnect();
        }
      })();
    }

    await shutdownPromise;
    process.exit(exitCode);
  };

  const registerShutdownHandler = (
    eventType: NodeJS.Signals,
    exitCode: number,
  ) => {
    process.once(eventType, () => {
      void shutdown(eventType, exitCode);
    });
  };

  const shutdownSignals: NodeJS.Signals[] = [
    'SIGINT',
    'SIGUSR1',
    'SIGUSR2',
    'SIGTERM',
  ];

  shutdownSignals.forEach(eventType => {
    registerShutdownHandler(eventType, 0);
  });

  process.once('uncaughtException', error => {
    logger.error(error);
    void shutdown('uncaughtException', 1);
  });

  process.once('unhandledRejection', error => {
    logger.error(error);
    void shutdown('unhandledRejection', 1);
  });
})();
