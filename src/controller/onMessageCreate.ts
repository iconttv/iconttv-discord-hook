import { Message } from 'discord.js';
import iconReplaceService from '../service/iconReplaceService';

export const onMessageCreate = async (message: Message) => {
  iconReplaceService(message);
};
