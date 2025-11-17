import client from './lib/discord';
import { registerEventsArchive } from './controller/archive/index';
import { config } from './config';
import { createMongooseConnection } from './database/index';
import { getKafkaProducer } from './service/kafkaService';

(async () => {
  await Promise.all([
    createMongooseConnection(),
    registerEventsArchive(client),
  ]);

  client.login(config.DISCORD_BOT_TOKEN);

  [
    `exit`,
    `SIGINT`,
    `SIGUSR1`,
    `SIGUSR2`,
    `uncaughtException`,
    `SIGTERM`,
  ].forEach(eventType => {
    process.on(eventType, async () => {
      const kafkaProducer = await getKafkaProducer();
      if (kafkaProducer) {
        await kafkaProducer.disconnect();
      }
    });
  });
})();
