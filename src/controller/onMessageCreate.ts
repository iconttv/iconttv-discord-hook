import { Message } from 'discord.js';
import { replaceIcon } from '../service/iconService';
import { saveMessage } from '../service/messageService';
import logger from '../lib/logger';

export const onMessageCreate = async (message: Message) => {
  logger.debug(`Hello Message. content: "${message.content}"`);
  await Promise.allSettled([replaceIcon(message), saveMessage(message)]);
  logger.debug(`Goodbye Message. content: "${message.content}"`);
};
