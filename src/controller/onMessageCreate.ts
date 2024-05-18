import { Message } from 'discord.js';
import { replaceIcon } from '../service/iconService';
import {
  saveMessage,
  summarizeLastMessagesAndReply,
} from '../service/messageService';

export const onMessageCreate = async (message: Message) => {
  await Promise.allSettled([
    saveMessage(message),
    summarizeLastMessagesAndReply(message),
    replaceIcon(message),
  ]);
};
