import { Events, Client } from 'discord.js';
import logger from '../../lib/logger';
import {
  bulkDeleteMessage,
  deleteMessage,
  saveMessage,
  updateMessage,
  savePreviousMessages,
} from '../../service/archive/message';
import { webhook } from '../../utils/webhook';

export const registerEventsArchive = (client: Client) => {
  client.once(Events.ClientReady, event => {
    webhook.sendMessage('MessageArchive Ready', null, 'info');
    logger.info(`MessageStore Logged in as ${event.user.tag}`);
  });

  client.on(Events.GuildCreate, async guild => {
    logger.info(`Client invited to ${guild.name}. fetch all messages.`);
    setTimeout(() => {
      savePreviousMessages(guild);
    }, 0);
  });

  client.on(Events.MessageCreate, async message => {
    await saveMessage(message);
  });

  client.on(Events.MessageUpdate, async (oldMessage, newMessage) => {
    await updateMessage(oldMessage, newMessage);
  });

  client.on(Events.MessageDelete, async message => {
    await deleteMessage(message);
  });

  client.on(Events.MessageBulkDelete, async messages => {
    await bulkDeleteMessage(messages);
  });
};
