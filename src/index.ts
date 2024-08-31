import client from './lib/discord';
import { registerEvents } from './controller/index';
import { config } from './config';
import { createMongooseConnection } from './database/index';

(async () => {
  await Promise.all([createMongooseConnection(), registerEvents(client)]);

  client.login(config.DISCORD_BOT_TOKEN);
})();
