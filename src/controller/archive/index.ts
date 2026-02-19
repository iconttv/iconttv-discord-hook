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
import { onMessageReactionChange } from '../../service/archive/reaction';

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
  
  client.on(Events.MessageReactionAdd, async (reaction, user) => {
    try {
      await onMessageReactionChange({
        type: 'add',
        reaction,
        user,
      });
    } catch (e) {
      webhook.sendMessage('MessageReactionAddError', e, 'error');
      logger.error(e);
    }
  });

  client.on(Events.MessageReactionRemove, async (reaction, user) => {
    try {
      await onMessageReactionChange({
        type: 'remove',
        reaction,
        user,
      });
    } catch (e) {
      webhook.sendMessage('MessageReactionRemoveError', e, 'error');
      logger.error(e);
    }
  });

  client.on(Events.MessageReactionRemoveAll, async message => {
    try {
      await onMessageReactionChange({
        type: 'removeAll',
        message,
      });
    } catch (e) {
      webhook.sendMessage('MessageReactionRemoveAllError', e, 'error');
      logger.error(e);
    }
  });

  client.on(Events.MessageReactionRemoveEmoji, async reaction => {
    try {
      await onMessageReactionChange({
        type: 'removeEmoji',
        reaction,
      });
    } catch (e) {
      webhook.sendMessage('MessageReactionRemoveEmojiError', e, 'error');
      logger.error(e);
    }
  });
};
