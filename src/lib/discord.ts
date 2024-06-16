import { Client, Events, GatewayIntentBits } from 'discord.js';
import logger from './logger';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  sweepers: {
    messages: {
      interval: 1800,
      lifetime: 1800,
    },
  },
});

client.once(Events.ClientReady, event => {
  logger.info(`Logged in as ${event.user.tag}`);
});

export default client;
