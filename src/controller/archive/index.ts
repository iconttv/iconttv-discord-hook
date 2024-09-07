import { Events, Client } from 'discord.js';
import logger from '../../lib/logger';
import { saveMessage } from '../../service/messageService';
import { webhook } from '../../utils/webhook';

export const registerEventsArchive = (client: Client) => {
  client.once(Events.ClientReady, event => {
    webhook.sendMessage('MessageArchive Ready', null, 'info');
    logger.info(`MessageStore Logged in as ${event.user.tag}`);
  });

  client.on(Events.MessageCreate, async message => {
    await saveMessage(message);
  });

  // client.on(Events.MessageUpdate, async (oldMessage, newMessage) => {});
};
