import { Message } from 'discord.js';
import { replaceIcon } from '../service/iconService';
import { saveMessage } from '../service/messageService';
import logger from '../lib/logger';

export const onMessageCreate = async (message: Message) => {
  logger.debug(`Message Received. content: "${message.content}"`);
  await Promise.allSettled([saveMessage(message), replaceIcon(message)]);
};
