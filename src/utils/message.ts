import { MessageType } from 'discord.js';
import { MessageFromDatabase } from '../type/index';
import { replaceLaughs } from './index';
import logger from '../lib/logger';
import MessageModel from '../database/model/MessageModel';
import { SummarizationOutput } from './llm/types';

export const convertMessagesToPrompt = (messages: MessageFromDatabase[]) => {
  const validMessages = messages.filter(
    message =>
      typeof message.senderName === 'string' &&
      typeof message.messageId === 'string' &&
      typeof message.message === 'string' &&
      message.message.length > 0
  );

  let formattedString = '';
  let currentSender: string | null = null;

  validMessages.forEach(msg => {
    const sender = msg.senderName;

    // 사용자가 변경된 경우 새로운 <user>와 <body> 태그 시작
    if (sender !== currentSender) {
      if (currentSender !== null) {
        formattedString += `</body>`; // 이전 사용자의 <body> 닫기
      }
      formattedString += `<user>${sender}</user><body>`; // 새로운 사용자 시작
      currentSender = sender as string; // 현재 작성자 업데이트
    }

    // 메시지를 추가
    formattedString += `${replaceLaughs(msg.message)}<id>${msg.messageId}</id>`;
  });

  // 마지막 사용자의 <body> 태그 닫기
  if (currentSender !== null) {
    formattedString += `</body>`;
  }

  return formattedString;
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
      {
        guildId: 1,
        channelId: 1,
        messageId: 1,
        guildName: 1,
        channelName: 1,
        senderName: 1,
        message: 1,
        createdAt: 1,
      }
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
      {
        guildId: 1,
        channelId: 1,
        messageId: 1,
        guildName: 1,
        channelName: 1,
        senderName: 1,
        message: 1,
        createdAt: 1,
      }
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

const unwrapJsonBlocks = (jsonRaw: string): string => {
  let text = jsonRaw.trim();
  const startToken = '```json';
  const endToken = '```';
  if (text.startsWith(startToken)) text = text.slice(startToken.length);
  if (text.endsWith(endToken)) text = text.slice(0, -endToken.length);
  return text;
};

export const getMessageLink = (
  guildId: string,
  channelId: string,
  messageId: string
) => `https://discord.com/channels/${guildId}/${channelId}/${messageId}`;

export const constructSummarizationResult = (
  guildId: string,
  channelId: string,
  summarization?: string
): string => {
  if (!summarization) return '요약된 내용이 없습니다.';

  const summarizationJson: SummarizationOutput = JSON.parse(
    unwrapJsonBlocks(summarization)
  );
  const topics = summarizationJson.topics
    .reduce((prev, curr) => {
      return (
        prev +
        '\n' +
        `- ${curr.topic} ` +
        getMessageLink(guildId, channelId, curr.startMessageId)
      );
    }, '')
    .trim();

  return `${topics.length === 0 ? '요약된 내용이 없습니다.' : topics}\n\n${
    summarizationJson.comment
  }`;
};
