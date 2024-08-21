import { Client, Options, GatewayIntentBits } from 'discord.js';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  makeCache: Options.cacheWithLimits({
    ...Options.DefaultMakeCacheSettings,
    GuildMemberManager: 1000,
    UserManager: 1000,
  }),
  sweepers: {
    ...Options.DefaultSweeperSettings,
    messages: {
      // clear cached message every 5 minutes
      interval: 5 * 60,
      lifetime: 5 * 60,
    },
  },
});

export default client;
