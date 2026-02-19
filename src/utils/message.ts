import { MessageType } from 'discord.js';
import { MessageFromDatabase } from '../type/index';
import { replaceLaughs } from './index';
import logger from '../lib/logger';
import { QuestionOutput, SummarizationOutput } from './llm/types';
import mongoose from 'mongoose';

const convertReactions = (reactions: MessageFromDatabase['reactions']) => {
  if (!reactions || !Array.isArray(reactions) || reactions.length === 0) {
    return null
  }

  const result = []
  for (const reaction of reactions) { 
    result.push({
      // "reaction": "<:b_jinup:1109368225441005588>",
      // "identifier": "b_jinup:1109368225441005588"
      'emoji': reaction.emoji.reaction,
      'count': reaction.count,
      'users': reaction.senders.map(sender => sender.senderName)
    })
  }
  return result
}

export const convertMessagesToPrompt = (messages: MessageFromDatabase[]) => {
  const validMessages = messages.filter(
    message =>
      typeof message.senderName === 'string' &&
      typeof message.messageId === 'string' &&
      (typeof message.EMBEDDING_INPUT === 'string' ||
        typeof message.message === 'string')
  );

  return validMessages
    .map(msg => {
      const messageContent = replaceLaughs(
        msg.EMBEDDING_INPUT ?? `# TEXT\n${msg.message}`
      )

      return JSON.stringify({
        senderName: msg.senderName,
        createdAt: msg.createdAt ? msg.createdAt.toISOString() : null,
        messageId: msg.messageId,
        content: messageContent,
        reactions: convertReactions(msg.reactions),
      });
    })
    .join('\n');
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
          reactions: 1,
          EMBEDDING_INPUT: 1,
        },
      },
    ];

    const cursor = await mongoose.connection
      .collection('discordMessages')
      .aggregate(pipelineDocuments);
    const messages = (await cursor.toArray()) as MessageFromDatabase[];

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
        $project: {
          guildId: 1,
          channelId: 1,
          messageId: 1,
          guildName: 1,
          channelName: 1,
          senderName: 1,
          createdAt: 1,
          message: 1,
          reactions: 1,
          EMBEDDING_INPUT: 1,
        },
      },
    ];

    const cursor = await mongoose.connection
      .collection('discordMessages')
      .aggregate(pipelineDocuments);
    const messages = (await cursor.toArray()) as MessageFromDatabase[];

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
    .filter(m => m.EMBEDDING_INPUT || m.message)
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
  if (!summarization) return '요약된 내용이 없습니다';

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

export const constructQuestionResult = (
  guildId: string,
  channelId: string,
  answer?: string
): string => {
  if (!answer) return '답변 내용이 없습니다';
  const answerJson: QuestionOutput = JSON.parse(unwrapJsonBlocks(answer));
  const messageLinks = (answerJson.startMessageIds ?? [])
    .reduce((prev, curr) => {
      return prev + ' ' + getMessageLink(guildId, channelId, curr);
    }, '')
    .trim();

  return `${answerJson.answer}\n\n${messageLinks}`;
};
