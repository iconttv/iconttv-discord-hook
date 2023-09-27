import {
  type Client,
} from "discord.js";
import { onMessageCreate } from "./onMessageCreate";
import logger from '@/lib/logger';

export function registerEvents(client: Client) {
  client.on('messageCreate', onMessageCreate);
  client.on('ready', () => {
    logger.info('Discord App Starts');
  });
}
