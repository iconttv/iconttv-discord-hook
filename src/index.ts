import * as dotenv from 'dotenv';
import client from './lib/discord';
import { registerEvents } from './controller';

dotenv.config({ path: process.env.NODE_ENV === 'prod' ? '.env' : '.env.dev' });

registerEvents(client);

client.login(process.env.DISCORD_BOT_TOKEN);
