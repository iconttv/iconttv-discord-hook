import { Message } from 'discord.js';
import { replaceIcon } from '../service/iconService';

export const onMessageCreate = async (message: Message) => {
  await replaceIcon(message);
};
