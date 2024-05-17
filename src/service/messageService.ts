import { Message } from 'discord.js';
import logger from '../lib/logger';
import MessageModel from '../database/model/MessageModel';
import { getMessageContext } from '../utils/discord';

export const saveMessage = async (message: Message) => {
  try {
    const context = getMessageContext(message);
    // ignore messages that does not contain any text
    if (!context || !context.senderMessage.trim()) return;

    const messageModel = new MessageModel({
      channelId: context.channelId,
      guildId: context.guildId,
      messageId: context.messageId,
      messageType: context.messageType,
      message: context.senderMessage,
      senderId: context.senderId,
      channelName: context.channelName,
      guildName: context.guildName,
      senderName: context.senderName,
      createdAt: context.createdAt,
    });

    await messageModel.save();
  } catch (e) {
    logger.error(e);
  }
};

const getLastHourMessages = async (
  channelId: string,
  guildId: string,
  hours: number
) => {
  const hoursAgo = new Date();
  hoursAgo.setMilliseconds(hoursAgo.getMilliseconds() - hours * 60 * 60 * 1000);

  try {
    const messages = await MessageModel.find({
      channelId,
      guildId,
      createdAt: { $gte: hoursAgo },
    }).exec();
    return messages;
  } catch (e) {
    logger.error(e);
    return [];
  }
};

const getLastNMessages = async (
  channelId: string,
  guildId: string,
  count: number
) => {
  try {
    const messages = await MessageModel.find()
      .sort({ createdAt: -1 })
      .limit(count)
      .exec();
    return messages;
  } catch (e) {
    logger.error(e);
    return [];
  }
};

export const getLastMessages = async (
  channelId: string,
  guildId: string,
  hours: number | undefined,
  count: number | undefined
) => {
  if (hours) return getLastHourMessages(channelId, guildId, hours);
  if (count) return getLastNMessages(channelId, guildId, count);
  return [];
};
