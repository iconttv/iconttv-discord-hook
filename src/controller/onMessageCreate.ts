import { Message } from 'discord.js';
import {
  getGuildMemberFromMessage,
  getSenderName,
  isAnonMessage,
  deleteMessage,
  sendIconMessageEmbed,
  getChannelFromMessage,
  sendIconMessage,
} from '../utils/discord';
import { parseIconSearchKeyword } from '../utils';
import IconSearchEngine from '../repository/search/IconSearchEngine';
import logger, { channel_log_message } from '../lib/logger';

export async function onMessageCreate(message: Message) {
  const { content: messageText } = message;

  const searchKeyword = parseIconSearchKeyword(messageText);
  if (!searchKeyword) return;

  const guildMember = getGuildMemberFromMessage(message);
  if (!guildMember) return;

  const channel = getChannelFromMessage(message);
  if (!channel) return;

  const sender = getSenderName(guildMember);

  const messageContext = {
    sender,
    senderMesage: messageText,
    guildName: guildMember.guild.name,
    guildId: guildMember.guild.id,
    channelName: channel.name,
    channelId: channel.id,
    threadName: message.thread?.name,
    threadId: message.thread?.id,
  };

  const matchIcon = await IconSearchEngine.instance.searchIcon(
    searchKeyword,
    guildMember.guild.id,
    [],
    messageContext
  );
  if (!matchIcon) return;

  logger.info(
    channel_log_message(
      `Icon Found: ${JSON.stringify(matchIcon)}`,
      messageContext
    )
  );

  sendIconMessageEmbed(message, matchIcon, isAnonMessage(messageText))
    .catch(e => {
      logger.error(
        channel_log_message(`Icon Embeded Post Failed: ${e}`, messageContext)
      );
      return sendIconMessage(message, matchIcon);
    })
    .catch(e => {
      logger.error(
        channel_log_message(`Icon Post Failed: ${e}`, messageContext)
      );
    })
    .then(() => {
      logger.debug(
        channel_log_message('Icon Posted Successfully', messageContext)
      );
    });

  deleteMessage(message)
    .catch(e => {
      logger.error(
        channel_log_message(`Message Deletion Failed: ${e}`, messageContext)
      );
    })
    .then(() => {
      logger.debug(
        channel_log_message('Message Deleted Successfully', messageContext)
      );
    });
}
