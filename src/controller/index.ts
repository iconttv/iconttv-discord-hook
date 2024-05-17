import { Events, Interaction, Client } from 'discord.js';
import logger from '../lib/logger';
import { onMessageCreate } from './onMessageCreate';
import { onCommandInteractionCreate } from './onCommandInteractionCreate';

export const registerEvents = (client: Client) => {
  client.on(Events.MessageCreate, async message => {
    try {
      await onMessageCreate(message);
    } catch (e) {
      logger.error(e);
    }
  });

  client.on(Events.InteractionCreate, async (interaction: Interaction) => {
    try {
      onCommandInteractionCreate(interaction);
    } catch (e) {
      logger.error(e);
    }
  });
};
