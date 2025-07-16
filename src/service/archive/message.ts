import {
  FetchMessagesOptions,
  Guild,
  Message,
  OmitPartialGroupDMChannel,
  PartialMessage,
  ReadonlyCollection,
} from 'discord.js';
import MessageModel from '../../database/model/MessageModel';
import logger from '../../lib/logger';
import { getLogContext } from '../../utils/discord';
import { retry } from 'es-toolkit';

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

const saveMessagesBulk = async (messages: Message<boolean>[]) => {
  const messageModels = [];
  for (const message of messages) {
    const context = getLogContext(message);
    if (!context || !context.guildMember || !context.channelId) continue;

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
    messageModels.push(messageModel);
  }
  if (messageModels.length === 0) {
    return null;
  }

  const result = await MessageModel.collection.insertMany(messageModels, {
    ordered: false, // ignore duplicated
  });
  return result;
};

export const savePreviousMessages = async (guild: Guild) => {
  // max 100, 이전 메시지 지정 가능
  const BATCH_SIZE = 100;

  const textChannels = guild.channels.cache.filter(channel => {
    return (
      channel.isTextBased() &&
      channel.viewable &&
      guild.members.me &&
      channel.permissionsFor(guild.members.me).has('ViewChannel') &&
      channel.permissionsFor(guild.members.me).has('ReadMessageHistory')
    );
  });

  for (const [channelId, channel] of textChannels) {
    const channelName = `${guild.name}_${channel.name} (${channelId})`;

    try {
      if (!('messages' in channel)) {
        continue;
      }
      let lastMessageId: string | undefined = undefined;
      logger.info(`Traverse ${channelName} lastMessageId: ${lastMessageId}`);

      // eslint-disable-next-line no-constant-condition
      while (true) {
        const options: FetchMessagesOptions = { limit: BATCH_SIZE };
        if (lastMessageId) {
          options.before = lastMessageId;
        }

        const messages = await retry(
          async () => {
            const messages = await channel.messages.fetch(options);
            return messages;
          },
          {
            retries: 5,
            delay: (attempts: number) => 2 ** attempts,
          }
        );
        if (messages.size === 0) {
          break; // 더 이상 불러올 메시지가 없으면 종료
        }
        lastMessageId = messages.last()?.id;

        try {
          const messageList = Array.from(messages.values());
          const result = await saveMessagesBulk(messageList);
          logger.info(`${channelName} save result ${result}`);
        } catch (error) {
          logger.error(`${channelName} failed to save messages ${error}`);
        }
      }

      logger.info(`${channelName} save messgeas done`);
    } catch (error) {
      logger.error(`${channelName} failed to fetch messages ${error}`);
    }
  }
};
