import {
  type Client,
} from "discord.js";
import { onMessageCreate } from './onMessageCreate';
import logger from '../lib/logger';

export function registerEvents(client: Client) {
  client.on('messageCreate', message => {
    try {
      onMessageCreate(message);
    } catch (e) {
      logger.error(e);
    }
  });
}
