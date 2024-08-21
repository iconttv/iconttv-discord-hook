import { Message } from 'discord.js';
import logger, { channel_log_message } from '../lib/logger';
import IconSearchEngine from '../repository/search/IconSearchEngine';
import { parseIconSearchKeyword } from '../utils/index';
import {
  sendIconMessageEmbed,
  isAnonMessage,
  sendIconMessage,
  deleteMessage,
  getMessageLogContext,
} from '../utils/discord/index';

export const replaceIcon = async (message: Message) => {
  const { content: messageText } = message;

  const searchKeyword = parseIconSearchKeyword(messageText);
  if (!searchKeyword) return;

  const messageLogContext = getMessageLogContext(message);
  if (!messageLogContext) return;

  const matchIcon = await IconSearchEngine.instance.searchIcon(
    searchKeyword,
    messageLogContext.guildId,
    [],
    messageLogContext
  );
  if (!matchIcon) return;

  logger.info(
    channel_log_message(
      `Icon Found: ${JSON.stringify(matchIcon)}`,
      messageLogContext
    )
  );

  sendIconMessageEmbed(message, matchIcon, isAnonMessage(messageText))
    .catch(e => {
      logger.error(
        channel_log_message(`Icon Embeded Post Failed: ${e}`, messageLogContext)
      );
      return sendIconMessage(message, matchIcon);
    })
    .catch(e => {
      logger.error(
        channel_log_message(`Icon Post Failed: ${e}`, messageLogContext)
      );
    })
    .then(() => {
      logger.debug(
        channel_log_message('Icon Posted Successfully', messageLogContext)
      );
    });

  deleteMessage(message)
    .catch(e => {
      logger.error(
        channel_log_message(`Message Deletion Failed: ${e}`, messageLogContext)
      );
    })
    .then(() => {
      logger.debug(
        channel_log_message('Message Deleted Successfully', messageLogContext)
      );
    });
};
