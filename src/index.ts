require("dotenv").config();

import client from "./lib/discord";

import { registerEvents } from "./controller";

registerEvents(client);

client.login(process.env.DISCORD_BOT_TOKEN);
