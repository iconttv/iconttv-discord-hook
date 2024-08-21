import { Message } from 'discord.js';
import { replaceIcon } from '../service/iconService';
import { saveMessage } from '../service/messageService';

export const onMessageCreate = async (message: Message) => {
  await Promise.allSettled([saveMessage(message), replaceIcon(message)]);
};
