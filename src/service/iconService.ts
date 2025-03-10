import { Message } from 'discord.js';
import logger, { channel_log_message } from '../lib/logger';
import IconSearchEngine from '../repository/search/IconSearchEngine';
import { parseIconSearchKeyword } from '../utils/index';
import {
  sendIconMessageEmbed,
  isAnonMessage,
  sendIconMessage,
  deleteMessage,
  getLogContext,
} from '../utils/discord/index';

export const replaceIcon = async (message: Message) => {
  const { content: messageText } = message;

  const [searchKeyword, restText] = parseIconSearchKeyword(messageText);
  const isAnon = isAnonMessage(messageText);
  if (!searchKeyword || (!isAnon && restText.length)) return;

  const messageLogContext = getLogContext(message);
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

  sendIconMessageEmbed(message, searchKeyword, matchIcon, isAnon)
    .then(message => {
      if (!message) {
        return;
      }

      const sendMessageContext = getLogContext(message);
      logger.debug(
        channel_log_message('Icon Posted Successfully', sendMessageContext!)
      );
    })
    .catch(e => {
      logger.error(
        channel_log_message(
          `Icon Embeded Post Failed. Try to send plain messsage. ${e}`,
          messageLogContext
        )
      );
      return sendIconMessage(message, matchIcon);
    })
    .catch(e => {
      logger.error(
        channel_log_message(`Icon Post Failed: ${e}`, messageLogContext)
      );
    });

  deleteMessage(message)
    .then(() => {
      logger.debug(
        channel_log_message('Message Deleted Successfully', messageLogContext)
      );
    })
    .catch(e => {
      logger.error(
        channel_log_message(`Message Deletion Failed. ${e}`, messageLogContext)
      );
    });
};
