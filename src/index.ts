import memwatch from '@airbnb/node-memwatch';
import client from './lib/discord.js';
import { registerEvents } from './controller/index.js';
import { config } from './config.js';
import { getConnection } from './database/index.js';
import logger from './lib/logger.js';
import { jsonStringify } from './utils/index.js';

(async () => {
  memwatch.on('stats', stats => {
    logger.debug(`GC done. ${jsonStringify(stats)}`);
  });

  await Promise.all([
    getConnection(), // test db connection
    registerEvents(client),
  ]);

  client.login(config.DISCORD_BOT_TOKEN);
})();
