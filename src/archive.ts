import client from './lib/discord';
import { registerEventsArchive } from './controller/archive/index';
import { config } from './config';
import { createMongooseConnection } from './database/index';

(async () => {
  await Promise.all([
    createMongooseConnection(),
    registerEventsArchive(client),
  ]);

  client.login(config.DISCORD_BOT_TOKEN);
})();
