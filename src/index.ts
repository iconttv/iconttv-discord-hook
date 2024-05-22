import client from './lib/discord';
import { registerEvents } from './controller';
import { config } from './config';
import { getConnection } from './database';

(async () => {
  await Promise.all([
    getConnection(), // test db connection
    registerEvents(client),
  ]);

  client.login(config.DISCORD_BOT_TOKEN);
})();
