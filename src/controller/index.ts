import { Events, Interaction, Client } from 'discord.js';
import logger from '../lib/logger';
import { onMessageCreate } from './onMessageCreate';
import { onCommandInteractionCreate } from './onCommandInteractionCreate';

export const registerEvents = (client: Client) => {
  client.on(Events.Debug, message => {
    logger.debug(message);
  });

  client.on(Events.Warn, error => {
    logger.warn(error);
  });

  client.on(Events.Error, error => {
    logger.error(error);
  });

  client.on(Events.CacheSweep, message => {
    logger.debug(`Cache Sweep: ${message}`);
  });

  client.on(Events.Invalidated, () => {
    logger.debug(`Invalidated`);
  });

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
