import { Events, Interaction, Client } from 'discord.js';
import logger from '../lib/logger';
import { onMessageCreate } from './onMessageCreate';
import { onCommandInteractionCreate } from './onCommandInteractionCreate';
import { webhook } from '../utils/webhook';
import { onModalSubmit } from './onModalSubmit';

export const registerEvents = (client: Client) => {
  client.once(Events.ClientReady, event => {
    webhook.sendMessage('MainApp Ready', null, 'info');
    logger.info(`Logged in as ${event.user.tag}`);
  });

  client.on(Events.Debug, message => {
    logger.debug(message);
  });

  client.on(Events.Warn, error => {
    webhook.sendMessage('Warn', error, 'warning');
    logger.warn(error);
  });

  client.on(Events.Error, error => {
    webhook.sendMessage('Error', error, 'error');
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
      webhook.sendMessage('MessageCreateError', e, 'error');
      logger.error(e);
    }
  });

  client.on(Events.MessageUpdate, async (_oldMessage, newMessage) => {
    try {
      await onMessageCreate(newMessage);
    } catch (e) {
      webhook.sendMessage('MessageCreateError', e, 'error');
      logger.error(e);
    }
  });

  client.on(Events.InteractionCreate, async (interaction: Interaction) => {
    if (interaction.isChatInputCommand()) {
      try {
        onCommandInteractionCreate(interaction);
      } catch (e) {
        webhook.sendMessage('InteractionCreateError', e, 'error');
        logger.error(e);
      }
    }

    if (interaction.isModalSubmit()) {
      try {
        onModalSubmit(interaction);
      } catch (e) {
        webhook.sendMessage('ModalSubmitError', e, 'error');
        logger.error(e);
      }
    }
  });
};
