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

  const [searchKeyword, restText] = parseIconSearchKeyword(messageText);
  if (!searchKeyword || restText.length) return;

  logger.debug(
    `replaceIcon-2 Before Create Message Context "${message.content}"`
  );
  const messageLogContext = getMessageLogContext(message);
  if (!messageLogContext) return;

  logger.debug(`replaceIcon-3 Before Search Icon "${message.content}"`);
  const matchIcon = await IconSearchEngine.instance.searchIcon(
    searchKeyword,
    messageLogContext.guildId,
    [],
    messageLogContext
  );
  if (!matchIcon) return;

  logger.debug(`replaceIcon-4 Icon Found "${message.content}"`);
  logger.info(
    channel_log_message(
      `Icon Found: ${JSON.stringify(matchIcon)}`,
      messageLogContext
    )
  );

  logger.debug(`replaceIcon-5 Before Send Icon "${message.content}"`);
  sendIconMessageEmbed(message, matchIcon, isAnonMessage(messageText))
    .then(message => {
      const sendMessageContext = getMessageLogContext(message);
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

  logger.debug(`replaceIcon-5 Before Delete Icon "${message.content}"`);
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
