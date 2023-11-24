import client from './lib/discord';
import { registerEvents } from './controller';
import { config } from './utils/config';

(async () => {
  await registerEvents(client);

  client.login(config.DISCORD_BOT_TOKEN);
})();
