import client from './lib/discord.js';
import { registerEvents } from './controller/index.js';
import { config } from './config.js';
import { getConnection } from './database/index.js';

(async () => {
  await Promise.all([
    getConnection(), // test db connection
    registerEvents(client),
  ]);

  client.login(config.DISCORD_BOT_TOKEN);
})();
