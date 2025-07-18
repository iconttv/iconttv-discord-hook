import { MessageType } from 'discord.js';
import { MessageFromDatabase } from '../type/index';
import { isUrl, replaceLaughs } from './index';
import logger from '../lib/logger';
import { SummarizationOutput } from './llm/types';
import mongoose from 'mongoose';

export const convertMessagesToPrompt = (messages: MessageFromDatabase[]) => {
  const validMessages = messages.filter(
    message =>
      typeof message.senderName === 'string' &&
      typeof message.messageId === 'string' &&
      typeof message.message === 'string' &&
      (message.message.length > 0 ||
        (message.message.length === 0 &&
          Array.isArray(message.vectors) &&
          message.vectors.length > 0))
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
      formattedString += `<user>${sender}</user><body><time>${msg.createdAt}</time>`; // 새로운 사용자 시작
      currentSender = sender as string; // 현재 작성자 업데이트
    }

    let messageContent: string | undefined = '';

    // 메시지를 추가
    if (!Array.isArray(msg.vectors) || msg.vectors.length === 0) {
      messageContent = `<text>${replaceLaughs(msg.message) || ''}</text>`;
    } else {
      for (const vector of msg.vectors.sort(
        (a, b) => Number(a.chunkId) - Number(b.chunkId)
      )) {
        if (vector.chunkType === 'message') {
          if (isUrl(msg.message)) {
            messageContent = `<url>${vector.content_text}</url>`;
          } else {
            messageContent = `<text>${replaceLaughs(msg.message) || ''}</text>`;
          }
        } else if (vector.chunkType === 'attachment_image') {
          messageContent = `<image>${vector.content_text}</image>`;
        } else if (vector.chunkType === 'attachment_file') {
          messageContent = `<file>${vector.content_text}</file>`;
        }
      }
    }

    formattedString += `${messageContent}<id>${msg.messageId}</id>`;
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
    const pipelineDocuments: mongoose.mongo.BSON.Document[] = [
      {
        $match: {
          guildId: guildId,
          channelId: channelId,
          messageType: {
            $nin: [
              MessageType.ChatInputCommand,
              MessageType.ContextMenuCommand,
            ],
          },
          createdAt: { $gte: hoursAgo },
          isDeleted: { $ne: true },
        },
      },
      { $sort: { createdAt: -1 } },
      // { $limit: 300 },
      {
        $lookup: {
          from: 'message_vectors',
          let: {
            guildId: '$guildId',
            channelId: '$channelId',
            messageId: '$messageId',
          },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$guildId', '$$guildId'] },
                    { $eq: ['$channelId', '$$channelId'] },
                    { $eq: ['$messageId', '$$messageId'] },
                  ],
                },
              },
            },
            // 마지막에 역정렬 할 것이므로, 내림차순으로 가져오기
            { $sort: { chunkId: -1 } },
          ],
          as: 'vectors',
        },
      },
      {
        $project: {
          guildId: 1,
          channelId: 1,
          messageId: 1,
          guildName: 1,
          channelName: 1,
          senderName: 1,
          createdAt: 1,
          message: 1,
          'vectors.content_text': 1,
          'vectors.chunkType': 1,
          'vectors.chunkId': 1,
        },
      },
    ];

    const messages = (await mongoose.connection
      .collection('messages')
      .aggregate(pipelineDocuments)
      .toArray()) as MessageFromDatabase[];
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
    const pipelineDocuments: mongoose.mongo.BSON.Document[] = [
      {
        $match: {
          guildId: guildId,
          channelId: channelId,
          messageType: {
            $nin: [
              MessageType.ChatInputCommand,
              MessageType.ContextMenuCommand,
            ],
          },
          isDeleted: { $ne: true },
        },
      },
      { $sort: { createdAt: -1 } },
      { $limit: count },
      {
        $lookup: {
          from: 'message_vectors',
          let: {
            guildId: '$guildId',
            channelId: '$channelId',
            messageId: '$messageId',
          },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$guildId', '$$guildId'] },
                    { $eq: ['$channelId', '$$channelId'] },
                    { $eq: ['$messageId', '$$messageId'] },
                  ],
                },
              },
            },
            // 마지막에 역정렬 할 것이므로, 내림차순으로 가져오기
            { $sort: { chunkId: -1 } },
          ],
          as: 'vectors',
        },
      },
      {
        $project: {
          guildId: 1,
          channelId: 1,
          messageId: 1,
          guildName: 1,
          channelName: 1,
          senderName: 1,
          createdAt: 1,
          message: 1,
          'vectors.content_text': 1,
          'vectors.chunkType': 1,
          'vectors.chunkId': 1,
        },
      },
    ];

    const messages = (await mongoose.connection
      .collection('messages')
      .aggregate(pipelineDocuments)
      .toArray()) as MessageFromDatabase[];

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
    .filter(m => m.message?.length || m.vectors?.length)
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
