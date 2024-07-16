import v8 from 'v8';
import client from './lib/discord.js';
import { registerEvents } from './controller/index.js';
import { config } from './config.js';
import { getConnection } from './database/index.js';
import logger from './lib/logger.js';

(async () => {
  logger.info(
    `Max Old Space Size: ${
      v8.getHeapStatistics().heap_size_limit / 1024 / 1024
    } MB`
  );

  await Promise.all([
    getConnection(), // test db connection
    registerEvents(client),
  ]);

  client.login(config.DISCORD_BOT_TOKEN);
})();
