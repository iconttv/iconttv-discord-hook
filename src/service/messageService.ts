import { Message, MessageType } from 'discord.js';
import logger from '../lib/logger';
import MessageModel from '../database/model/MessageModel';
import { getMessageContext } from '../utils/discord';
import { questionMessages, summarizeMessages } from '../utils/llm/openai';
import MessageSummarizationModel from '../database/model/MessageSummarizationModel';
import GuildPermissionModel from '../database/model/GuildPermissionModel';
import { makeChunk, replaceLaughs } from '../utils';

export interface MessageFromDatabase {
  guildName?: string | null | undefined;
  channelName?: string | null | undefined;
  senderName?: string | null | undefined;
  message?: string | null | undefined;
}

export const saveMessage = async (message: Message) => {
  try {
    const context = getMessageContext(message);
    // ignore messages that does not contain any text
    if (!context || !context.senderMessage.trim()) return;

    const messageModel = new MessageModel({
      guildId: context.guildId,
      channelId: context.channelId,
      messageId: context.messageId,
      messageType: context.messageType,
      message: context.senderMessage,
      senderId: context.senderId,
      guildName: context.guildName,
      channelName: context.channelName,
      senderName: context.senderName,
      createdAt: context.createdAt,
    });

    await messageModel.save();
  } catch (e) {
    logger.error(e);
  }
};

export const summarizeLastMessages = async (
  guildId: string,
  channelId: string,
  hours: number | undefined = undefined,
  count: number | undefined = undefined
) => {
  const tenMinAgo = new Date();
  tenMinAgo.setMilliseconds(tenMinAgo.getMilliseconds() - 5 * 60 * 1000);

  const cached = await MessageSummarizationModel.find({
    guildId,
    channelId,
    hours,
    count,
    createdAt: { $gte: tenMinAgo },
  })
    .sort({ createdAt: -1 })
    .limit(1)
    .exec();

  if (cached.length) {
    return `${cached[0].summarization}\n\n(최근 5분 이내 응답에서 캐시됨)`;
  }

  const messages = await getLastMessages(guildId, channelId, hours, count);
  const messageChunks = makeChunk(messages, 700);
  const messagePrompts = messageChunks.map(convertMessagesToPrompt);
  const summarization = await summarizeMessages(messagePrompts);

  if (summarization) {
    try {
      await new MessageSummarizationModel({
        guildId,
        channelId,
        hours,
        count,
        summarization,
      }).save();
    } catch (e) {
      logger.error(e);
    }
  }

  return summarization;
};

export const questionLastMessages = async (
  guildId: string,
  channelId: string,
  count: number,
  question: string
) => {
  const guildPermission = await GuildPermissionModel.find({
    guildId,
  });
  if (
    guildPermission === null ||
    guildPermission === undefined ||
    guildPermission.length === 0
  ) {
    return '해당 기능을 사용할 권한이 부족합니다. [000]';
  }
  if (guildPermission[0].level < 3) {
    return '해당 기능을 사용할 권한이 부족합니다. [001]';
  }

  const messages = await getLastMessages(guildId, channelId, undefined, count);
  const messagePrompt = convertMessagesToPrompt(messages);
  const answer = await questionMessages(messagePrompt, question);
  return answer;
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
      { guildName: 1, channelName: 1, senderName: 1, message: 1 }
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
      { guildName: 1, channelName: 1, senderName: 1, message: 1 }
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

export const convertMessagesToPrompt = (messages: MessageFromDatabase[]) => {
  const conversations = [];
  let currentUserName = '';
  let currentMessage = '';
  for (const message of messages) {
    if (currentUserName === message.senderName) {
      currentMessage += `\n${message.message}`;
    } else {
      if (currentUserName && currentMessage) {
        currentMessage = replaceLaughs(currentMessage);
        conversations.push(`[${currentUserName}] ${currentMessage}`);
      }

      currentUserName = `${message.senderName}`;
      currentMessage = `${message.message}`;
    }
  }
  currentMessage = replaceLaughs(currentMessage);
  conversations.push(`[${currentUserName}] ${currentMessage}`);
  const conversation = conversations.join('\n');
  return conversation;
};
