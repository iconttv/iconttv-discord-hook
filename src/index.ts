import * as dotenv from 'dotenv';
import client from './lib/discord';
import { registerEvents } from './controller';

dotenv.config();

registerEvents(client);

client.login(process.env.DISCORD_BOT_TOKEN);
