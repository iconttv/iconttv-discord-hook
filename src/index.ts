import client from './lib/discord.js';
import { registerEvents } from './controller/index.js';
import { config } from './config.js';
import { getConnection } from './database/index.js';
import logger from './lib/logger.js';

const logMemoryUsage = () => {
  const mu = process.memoryUsage();
  // # bytes / KB / MB / GB
  const gbTotal = mu.heapTotal / 1024 / 1024 / 1024;
  const gbNow = mu.heapUsed / 1024 / 1024 / 1024;
  const gbRounded = Math.round(gbNow * 100) / 100;
  logger.debug(`Heap allocated ${gbRounded} / ${gbTotal} GB`);
};

(async () => {
  await Promise.all([
    getConnection(), // test db connection
    registerEvents(client),
  ]);

  client.login(config.DISCORD_BOT_TOKEN);

  setInterval(logMemoryUsage, 30 * 1000);
})();
