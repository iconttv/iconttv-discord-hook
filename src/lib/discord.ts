import { Client, Events, GatewayIntentBits } from 'discord.js';

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

export default client;
