import { Message } from 'discord.js';
import logger from '../lib/logger';
import MessageModel from '../database/model/MessageModel';
import { getMessageLogContext } from '../utils/discord/index';
import {
  openaiQuestionMessages,
  openaiSummarizeMessages,
  geminiQuestionMessages,
  geminiSummarizeMessages,
} from '../utils/llm/index';
import MessageSummarizationModel from '../database/model/MessageSummarizationModel';
import { unreplaceLaughs } from '../utils/index';
import { saveAiRequestBuilder } from './common';
import { getLastMessages } from '../utils/message';

const useOpenai = () => Math.random() < 0.5;

export const saveMessage = async (message: Message) => {
  try {
    logger.debug(
      `saveMessage-1 Before Create Message Context "${message.content}"`
    );
    const context = getMessageLogContext(message);
    if (!context || !context.guildMember || !context.channel) return;

    logger.debug(
      `saveMessage-2 Before Create Message Model "${context.senderName} - ${context.senderMessage}"`
    );
    const messageModel = new MessageModel({
      guildId: context.guildId,
      channelId: context.channelId,
      messageId: context.messageId,
      messageType: context.messageType,
      message: context.senderMessage,
      attachments: context.attachments,
      components: context.components,
      embeds: context.embeds,
      senderId: context.senderId,
      guildName: context.guildName,
      channelName: context.channelName,
      senderName: context.senderName,
      raw: JSON.stringify(message),
      createdAt: context.createdAt,
    });
    messageModel.isNew = true;

    logger.debug(
      `saveMessage-3 Before Mesasge Save "${context.senderName} - ${context.senderMessage}"`
    );
    await messageModel.save({
      w: 0,
      wtimeout: 1000,
    });
    logger.debug(
      `saveMessage-4 Message Saved! "${context.senderName} - ${context.senderMessage}"`
    );
  } catch (e) {
    logger.error(e);
  }
};

export const summarizeLastMessages = async (
  guildId: string,
  channelId: string,
  senderId: string | undefined,
  hours: number | undefined = undefined,
  count: number | undefined = undefined
) => {
  const minsOld = new Date();
  minsOld.setMilliseconds(minsOld.getMilliseconds() - 5 * 60 * 1000);

  const cached = await MessageSummarizationModel.find({
    guildId,
    channelId,
    hours,
    count,
    createdAt: { $gte: minsOld },
  })
    .sort({ createdAt: -1 })
    .limit(1)
    .exec();

  if (cached.length) {
    return `${cached[0].summarization}\n\n(최근 5분 이내 응답에서 캐시됨)`;
  }

  const messages = await getLastMessages(guildId, channelId, hours, count);
  const summarizer = useOpenai()
    ? openaiSummarizeMessages
    : geminiSummarizeMessages;

  const summarization = await summarizer(
    messages,
    saveAiRequestBuilder(guildId, channelId, senderId, { hours, count })
  );

  if (summarization) {
    try {
      await new MessageSummarizationModel({
        guildId,
        channelId,
        senderId,
        hours,
        count,
        summarization,
      }).save();
    } catch (e) {
      logger.error(e);
    }
  }

  return unreplaceLaughs(summarization);
};

export const questionLastMessages = async (
  guildId: string,
  channelId: string,
  senderId: string | undefined,
  count: number,
  question: string
) => {
  const messages = await getLastMessages(guildId, channelId, undefined, count);
  const quentioner = useOpenai()
    ? openaiQuestionMessages
    : geminiQuestionMessages;
  const answer = await quentioner(
    messages,
    question,
    saveAiRequestBuilder(guildId, channelId, senderId, { question, count })
  );
  return unreplaceLaughs(answer);
};
