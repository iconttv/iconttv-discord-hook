/* eslint-disable @typescript-eslint/no-extra-non-null-assertion */
import {
  FetchMessagesOptions,
  Guild,
  Message,
  OmitPartialGroupDMChannel,
  PartialMessage,
  ReadonlyCollection,
  SnowflakeUtil,
} from 'discord.js';
import MessageModel from '../../database/model/MessageModel';
import logger from '../../lib/logger';
import {
  getLogContext,
  getMessageIdentityFilter,
  getMessageIdentityFilterFromMessage,
} from '../../utils/discord';
import { retry } from 'es-toolkit';
import { processMessage } from '../embedding/discord_processor';
import { produceMessageToKafka } from '../kafkaService';
import { isArchiveShutdownRequested } from './lifecycle';

export const saveMessage = async (message: Message) => {
  try {
    logger.debug(
      `saveMessage-1 Before Create Message Context "${message.content}"`
    );
    const context = await getLogContext(message);
    if (!context || !context.guildMember || !context.channelId) return;

    logger.debug(
      `saveMessage-2 Before Create Message Model "${context.senderName} - ${context.senderMessage}"`
    );
    const messageDocument = {
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
    } as const;
    const messageModel = new MessageModel(messageDocument);

    const kafkaPromise = produceMessageToKafka(context);

    try {
      const messageEmbedding = await processMessage(messageDocument);
      if (messageEmbedding) {
        messageModel.TEXT_MESSAGE = messageEmbedding.TEXT_MESSAGE;
        messageModel.TEXT_ATTACHMENTS = messageEmbedding.TEXT_ATTACHMENTS!!;
        messageModel.TEXT_COMPONENTS = messageEmbedding.TEXT_COMPONENTS!!;
        messageModel.TEXT_EMBEDS = messageEmbedding.TEXT_EMBEDS!!;
        messageModel.EMBEDDING_MODEL = messageEmbedding.EMBEDDING_MODEL!!;
        messageModel.EMBEDDING_DIM = messageEmbedding.EMBEDDING_DIM!!;
        messageModel.EMBEDDING_INPUT = messageEmbedding.EMBEDDING_INPUT!!;
        messageModel.EMBEDDING = messageEmbedding.EMBEDDING!!;
        messageModel.EMBEDDING_STATUS = messageEmbedding.EMBEDDING_STATUS!!;
      }
    } catch (e) {
      // set EMBEDDING_STATUS as null
      logger.error(e);
    }

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

    await kafkaPromise;
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
    const context = await getLogContext(newMessage);
    if (!context || !context.guildMember || !context.channelId) return;

    logger.debug(
      `updateMessage-2 Before Mesasge Update "${context.senderName} - ${context.senderMessage}"`
    );
    const filter = getMessageIdentityFilter(context);
    if (!filter) return;

    await MessageModel.findOneAndUpdate(
      filter,
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
    const filter = getMessageIdentityFilterFromMessage(message);
    if (!filter) return;

    logger.debug(
      `deleteMessage-2 Before Mesasge Delete "${message.author} - ${message.content}"`
    );
    await MessageModel.findOneAndUpdate(
      filter,
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

    const bulkOps: {
      updateOne: {
        filter: {
          guildId: string;
          channelId: string;
          messageId: string;
        };
        update: {
          isDeleted: true;
          deletedAt: number;
        };
      };
    }[] = [];

    messages.forEach(message => {
      const filter = getMessageIdentityFilterFromMessage(message);
      if (!filter) {
        return;
      }

      bulkOps.push({
        updateOne: {
          filter,
          update: {
            isDeleted: true,
            deletedAt: Date.now(),
          },
        },
      });
    });

    if (bulkOps.length === 0) {
      return;
    }

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
  type ProcessMessageInput = Parameters<typeof processMessage>[0];
  type ProcessMessageOutput = NonNullable<Awaited<ReturnType<typeof processMessage>>>;
  type BulkMessageDocument = ProcessMessageInput &
    Omit<Partial<ProcessMessageOutput>, 'EMBEDDING_STATUS'> & {
      _CREATED_AT: Date;
      EMBEDDING_STATUS?: boolean | null;
    };

  const CHUNK_SIZE = 5;
  let savedDocumentCount = 0;

  for (let index = 0; index < messages.length; index += CHUNK_SIZE) {
    const messageChunk = messages.slice(index, index + CHUNK_SIZE);

    try {
      const documentResults = await Promise.allSettled(
        messageChunk.map(async message => {
          const context = await getLogContext(message);
          if (!context || !context.channelId) {
            logger.debug(`ignore message ${message.id}. channelId: ${context?.channelId}`)
            return null;
          }

          const doc: BulkMessageDocument = {
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
            _CREATED_AT: new Date(),
          };

          try {
            const messageEmbedding = await processMessage(doc);
            if (messageEmbedding) {
              // Object.assign(doc, messageEmbedding);
              doc.TEXT_MESSAGE = messageEmbedding.TEXT_MESSAGE;
              doc.TEXT_ATTACHMENTS = messageEmbedding.TEXT_ATTACHMENTS;
              doc.TEXT_COMPONENTS = messageEmbedding.TEXT_COMPONENTS;
              doc.TEXT_EMBEDS = messageEmbedding.TEXT_EMBEDS;
              doc.EMBEDDING_MODEL = messageEmbedding.EMBEDDING_MODEL;
              doc.EMBEDDING_DIM = messageEmbedding.EMBEDDING_DIM;
              doc.EMBEDDING_INPUT = messageEmbedding.EMBEDDING_INPUT;
              doc.EMBEDDING = messageEmbedding.EMBEDDING;
              doc.EMBEDDING_STATUS = messageEmbedding.EMBEDDING_STATUS;
            } else {
              doc.EMBEDDING_STATUS = null;
            }
          } catch (e) {
            doc.EMBEDDING_STATUS = null;
            logger.error(e);
          }

          return doc;
        })
      );

      const validDocuments: BulkMessageDocument[] = [];

      documentResults.forEach(result => {
        if (result.status === 'rejected') {
          logger.error(result.reason);
          return;
        }

        if (result.value) {
          validDocuments.push(result.value);
        }
      });

      if (validDocuments.length === 0) {
        continue;
      }

      await MessageModel.bulkWrite(
        validDocuments.map(doc => ({
          updateOne: {
            filter: {
              guildId: doc.guildId,
              channelId: doc.channelId,
              messageId: doc.messageId,
            },
            update: {
              $set: doc,
            },
            upsert: true,
          },
        })),
        { ordered: false }
      );
      logger.debug(`message bulk saved ${validDocuments.map(d => d.messageId).join(',')}`)

      savedDocumentCount += validDocuments.length;
    } catch (e) {
      logger.error(e);
    }
  }

  return savedDocumentCount === 0 ? null : savedDocumentCount;
};

export const savePreviousMessages = async (
  guild: Guild,
  beforeMessageId?: string,
  afterMessageId?: string,
) => {
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
    if (isArchiveShutdownRequested()) {
      break;
    }

    const channelName = `${guild.name}_${channel.name} (${channelId})`;

    try {
      if (!('messages' in channel)) {
        continue;
      }
      let lastMessageId: string | undefined = beforeMessageId;

      // eslint-disable-next-line no-constant-condition
      while (true) {
        if (isArchiveShutdownRequested()) {
          break;
        }

        const options: FetchMessagesOptions = { limit: BATCH_SIZE, cache: false };
        if (afterMessageId) {
          options.after = afterMessageId;
        }
        if (lastMessageId) {
          options.before = lastMessageId;
        }
        logger.info(`Traverse ${channelName} options: ${JSON.stringify(options)}`);

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
          await saveMessagesBulk(messageList);
          logger.info(`${channelName} saved messages ${messageList.length}`);
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


export const savePreviousMessagesAfterJoin = async (
  guild: Guild,
) => {
  if (isArchiveShutdownRequested()) {
    return;
  }

  const epoch = new Date();
  const beforeMessageId = SnowflakeUtil.generate({
    timestamp: epoch,
  }).toString();

  const newestMessage = await MessageModel.findOne({
    guildId: guild.id,
  }).sort({ createdAt: -1 }).select('messageId');

  await savePreviousMessages(guild, beforeMessageId, newestMessage?.messageId);

  if (isArchiveShutdownRequested()) {
    return;
  }

  const oldestMessage = await MessageModel.findOne({
    guildId: guild.id,
  }).sort({ createdAt: 1 }).select('messageId');
  if (oldestMessage) {
    await savePreviousMessages(guild, oldestMessage.messageId);
  }
};
