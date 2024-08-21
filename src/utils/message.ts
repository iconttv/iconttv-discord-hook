import { MessageType } from 'discord.js';
import { MessageFromDatabase } from '../type/index';
import { formatDate, replaceLaughs } from './index';
import logger from '../lib/logger';
import MessageModel from '../database/model/MessageModel';

export const convertMessagesToPrompt = (messages: MessageFromDatabase[]) => {
  const conversations = [];
  let currentUserName = '';
  let currentMessageWithTimestamp = '';
  for (const message of messages) {
    const mmdd = formatDate(message.createdAt);
    const timestamp = mmdd.length ? `(${mmdd})` : '';
    const normalizedMessageWithTimestamp = `${replaceLaughs(
      message.message
    )} ${timestamp}`;

    if (currentUserName === message.senderName) {
      currentMessageWithTimestamp += `\n${normalizedMessageWithTimestamp}`;
    } else {
      if (currentUserName && currentMessageWithTimestamp) {
        conversations.push(
          `[${currentUserName}] ${currentMessageWithTimestamp}`
        );
      }

      currentUserName = `${message.senderName}`;
      currentMessageWithTimestamp = normalizedMessageWithTimestamp;
    }
  }
  conversations.push(`[${currentUserName}] ${currentMessageWithTimestamp}`);
  const conversation = conversations.join('\n');
  return conversation;
};

const getLastHourMessages = async (
  guildId: string,
  channelId: string,
  hours: number
): Promise<MessageFromDatabase[]> => {
  const hoursAgo = new Date();
  hoursAgo.setMilliseconds(hoursAgo.getMilliseconds() - hours * 60 * 60 * 1000);

  try {
    const messages = await MessageModel.find(
      {
        guildId,
        channelId,
        messageType: {
          $nin: [MessageType.ChatInputCommand, MessageType.ContextMenuCommand],
        },
        createdAt: { $gte: hoursAgo },
      },
      { guildName: 1, channelName: 1, senderName: 1, message: 1, createdAt: 1 }
    )
      .sort({ createdAt: -1 })
      .exec();
    return messages.reverse();
  } catch (e) {
    logger.error(e);
    return [];
  }
};

const getLastNMessages = async (
  guildId: string,
  channelId: string,
  count: number
): Promise<MessageFromDatabase[]> => {
  try {
    const messages = await MessageModel.find(
      {
        guildId,
        channelId,
        messageType: {
          $nin: [MessageType.ChatInputCommand, MessageType.ContextMenuCommand],
        },
      },
      { guildName: 1, channelName: 1, senderName: 1, message: 1, createdAt: 1 }
    )
      .sort({ createdAt: -1 })
      .limit(count)
      .exec();
    return messages.reverse();
  } catch (e) {
    logger.error(e);
    return [];
  }
};

export const getLastMessages = async (
  guildId: string,
  channelId: string,
  hours: number | undefined = undefined,
  count: number | undefined = undefined
) => {
  if (!hours && !count) return [];

  const messages = await (() => {
    if (hours) return getLastHourMessages(guildId, channelId, hours);
    if (count) return getLastNMessages(guildId, channelId, count);
    return [];
  })();

  const filteredMessages = messages
    .filter(m => m.message?.length)
    .filter(m => !m.senderName?.startsWith('iconttv-'));

  logger.debug(`Fetched ${filteredMessages.length} messages.`);
  return filteredMessages;
};
