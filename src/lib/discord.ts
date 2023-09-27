import { Client, Events, GatewayIntentBits } from "discord.js";
import logger from './logger';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.once(Events.ClientReady, (event) => {
  logger.info(`Logged in as ${event.user.tag}`);
});

export default client;
