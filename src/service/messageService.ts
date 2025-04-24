import { CommandInteraction, Interaction, Message } from 'discord.js';
import logger from '../lib/logger';
import { getLogContext, getSenderId } from '../utils/discord/index';
import { summarizeMessages, questionMessages } from '../utils/llm/index';
import MessageSummarizationModel from '../database/model/MessageSummarizationModel';
import { unreplaceLaughs } from '../utils/index';
import { saveAiRequestBuilder } from './common';
import { getLastMessages } from '../utils/message';

export const summarizeLastMessages = async (
  trigger: Message | Interaction | CommandInteraction,
  hours: number | undefined = undefined,
  count: number | undefined = undefined
) => {
  const { guildId, channelId } = trigger;
  const senderId = getSenderId(trigger);
  if (!guildId || !channelId || !senderId) {
    return;
  }

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
  const summarization = await summarizeMessages({
    messages,
    guildId,
    channelId,
    context: getLogContext(trigger),
    logRequest: saveAiRequestBuilder(guildId, channelId, senderId, {
      hours,
      count,
    }),
  });

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

  const answer = await questionMessages({
    messages,
    question,
    logRequest: saveAiRequestBuilder(guildId, channelId, senderId, {
      question,
      count,
    }),
  });
  return unreplaceLaughs(answer);
};
