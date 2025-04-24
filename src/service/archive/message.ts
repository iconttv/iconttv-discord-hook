import {
  Message,
  OmitPartialGroupDMChannel,
  PartialMessage,
  ReadonlyCollection,
} from 'discord.js';
import MessageModel from '../../database/model/MessageModel';
import logger from '../../lib/logger';
import { getLogContext } from '../../utils/discord';

export const saveMessage = async (message: Message) => {
  try {
    logger.debug(
      `saveMessage-1 Before Create Message Context "${message.content}"`
    );
    const context = getLogContext(message);
    if (!context || !context.guildMember || !context.channelId) return;

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

export const updateMessage = async (
  _oldMessage: OmitPartialGroupDMChannel<Message<boolean> | PartialMessage>,
  newMessage: OmitPartialGroupDMChannel<Message<boolean>>
) => {
  try {
    logger.debug(
      `updateMessage-1 Before Create Message Update Context "${newMessage.content}"`
    );
    const context = getLogContext(newMessage);
    if (!context || !context.guildMember || !context.channelId) return;

    logger.debug(
      `updateMessage-2 Before Mesasge Update "${context.senderName} - ${context.senderMessage}"`
    );
    await MessageModel.findOneAndUpdate(
      {
        guildId: context.guildId,
        channelId: context.channelId,
        messageId: context.messageId,
      },
      {
        messageType: context.messageType,
        message: context.senderMessage,
        attachments: context.attachments,
        components: context.components,
        embeds: context.embeds,
        senderId: context.senderId,
        guildName: context.guildName,
        channelName: context.channelName,
        senderName: context.senderName,
        raw: JSON.stringify(newMessage),
        createdAt: newMessage.createdAt,
        editedAt: newMessage.editedAt,
      },
      { upsert: true, new: true }
    );
    logger.debug(
      `updateMessage-3 Message Updated! "${context.senderName} - ${context.senderMessage}"`
    );
  } catch (e) {
    logger.error(e);
  }
};

export const deleteMessage = async (
  message: OmitPartialGroupDMChannel<Message<boolean> | PartialMessage>
) => {
  try {
    logger.debug(
      `deleteMessage-1 Before Create Message Delete Context "${message.content}"`
    );
    if (!message.guildId || !message.channelId || !message.id) return;

    logger.debug(
      `deleteMessage-2 Before Mesasge Delete "${message.author} - ${message.content}"`
    );
    await MessageModel.findOneAndUpdate(
      {
        guildId: message.guildId,
        channelId: message.channelId,
        messageId: message.id,
      },
      {
        isDeleted: true,
        deletedAt: Date.now(),
      }
    );
    logger.debug(
      `deleteMessage-3 Message Deleted! "${message.author} - ${message.content}"`
    );
  } catch (e) {
    logger.error(e);
  }
};

export const bulkDeleteMessage = async (
  messages: ReadonlyCollection<
    string,
    OmitPartialGroupDMChannel<Message<boolean> | PartialMessage>
  >
) => {
  try {
    const messageContents = messages
      .map(message => `${message.author} - ${message.content}`)
      .join('\n');

    logger.debug(
      `bulkDeleteMessage-1 Before Create Message Bulk Delete Context "${messageContents}"`
    );

    const bulkOps = messages.map(message => ({
      updateOne: {
        filter: {
          guildId: message.guildId,
          channelId: message.channelId,
          messageId: message.id,
        },
        update: {
          isDeleted: true,
          deletedAt: Date.now(),
        },
      },
    }));
    logger.debug(`bulkDeleteMessage-2 Before Mesasge Bulk Delete "${bulkOps}"`);
    await MessageModel.bulkWrite(bulkOps);
    logger.debug(
      `bulkDeleteMessage-3 Message Bulk Deleted! "${messageContents}"`
    );
  } catch (e) {
    logger.error(e);
  }
};
