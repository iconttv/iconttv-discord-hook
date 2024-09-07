import { Message } from 'discord.js';
import { replaceIcon } from '../service/iconService';
import logger from '../lib/logger';

export const onMessageCreate = async (message: Message) => {
  logger.debug(`Hello Message. content: "${message.content}"`);
  await replaceIcon(message);
  logger.debug(`Goodbye Message. content: "${message.content}"`);
};
