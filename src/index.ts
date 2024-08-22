import client from './lib/discord';
import { registerEvents } from './controller/index';
import { config } from './config';
import { getConnection } from './database/index';

(async () => {
  await Promise.all([
    getConnection(), // test db connection
    registerEvents(client),
  ]);

  client.login(config.DISCORD_BOT_TOKEN);
})();
