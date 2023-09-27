import { Message } from 'discord.js';
import {
  getGuildMemberFromMessage,
  getSenderName,
  isAnonMessage,
  deleteMessage,
  sendIconMessage,
} from '../utils/discord';
import { parseIconSearchKeyword } from '../utils';
import IconSearchEngine from '../repository/search/IconSearchEngine';
import logger from '../lib/logger';

export async function onMessageCreate(message: Message) {
  const { content: messageText } = message;

  const searchKeyword = parseIconSearchKeyword(messageText);
  if (!searchKeyword) return;

  const guildMember = getGuildMemberFromMessage(message);
  if (!guildMember) return;

  const sender = getSenderName(guildMember);

  const matchIcon = await IconSearchEngine.instance.searchIcon(
    searchKeyword,
    guildMember.guild.id
  );
  if (!matchIcon) return;

  logger.info(`"${sender}": "${messageText}" @ ${guildMember.guild.id}`);

  await Promise.all([
    sendIconMessage(message, matchIcon, isAnonMessage(messageText)),
    deleteMessage(message),
  ]);
}
