import memwatch from '@airbnb/node-memwatch';
import client from './lib/discord';
import { registerEvents } from './controller/index';
import { config } from './config';
import { getConnection } from './database/index';
import logger from './lib/logger';
import { jsonStringify } from './utils/index';

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
