import { Message } from 'discord.js';
import { replaceIcon } from '../service/iconService.js';
import { saveMessage } from '../service/messageService.js';

export const onMessageCreate = async (message: Message) => {
  await Promise.allSettled([saveMessage(message), replaceIcon(message)]);
};
