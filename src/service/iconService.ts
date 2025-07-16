import { Message, TextChannel } from 'discord.js';
import logger, { channel_log_message } from '../lib/logger';
import IconSearchEngine from '../repository/search/IconSearchEngine';
import { parseIconSearchKeyword } from '../utils/index';
import {
  isAnonMessage,
  deleteMessage,
  getLogContext,
  createIconEmbedMessagePayload,
  LogContext,
  createIconFileMessagePayload,
} from '../utils/discord/index';
import { Icon } from '../models';

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

  await sendAndDeleteIconMessage(
    message,
    searchKeyword,
    matchIcon,
    isAnon,
    messageLogContext
  );
};

export const sendAndDeleteIconMessage = async (
  message: Message,
  matchKeyword: string,
  matchIcon: Icon,
  asAnonUser: boolean,
  logContext: LogContext
) => {
  const iconEmbedMessagePayload = createIconEmbedMessagePayload(
    message,
    matchKeyword,
    matchIcon,
    asAnonUser
  );

  (message.channel as TextChannel)
    .send(iconEmbedMessagePayload)
    .then(message => {
      if (!message) {
        return;
      }

      logger.debug(
        channel_log_message('Icon Posted Successfully', logContext!)
      );
    })
    .catch(e => {
      logger.error(
        channel_log_message(
          `Icon Embeded Post Failed. Try to send plain messsage. ${e}`,
          logContext
        )
      );
      const iconFileMessagePayload = createIconFileMessagePayload(matchIcon);
      return (message.channel as TextChannel).send(iconFileMessagePayload);
    })
    .catch(e => {
      logger.error(channel_log_message(`Icon Post Failed: ${e}`, logContext));
    });

  deleteMessage(message)
    .then(() => {
      logger.debug(
        channel_log_message('Message Deleted Successfully', logContext)
      );
    })
    .catch(e => {
      logger.error(
        channel_log_message(`Message Deletion Failed. ${e}`, logContext)
      );
    });
};
