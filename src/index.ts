import client from './lib/discord';
import { registerEvents } from './controller';
import { config } from './config';
import { getConnection } from './database';

(async () => {
  // test database connection
  await getConnection();

  await registerEvents(client);
  client.login(config.DISCORD_BOT_TOKEN);
})();
