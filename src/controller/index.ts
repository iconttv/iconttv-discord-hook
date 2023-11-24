import { Events, Interaction, Client } from 'discord.js';
import logger from '../lib/logger';
import { onMessageCreate } from './onMessageCreate';
import { onCommandInteractionCreate } from './onCommandInteractionCreate';

export const registerEvents = async (client: Client) => {
  client.on(Events.MessageCreate, message => {
    try {
      onMessageCreate(message);
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
