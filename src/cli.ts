import { Command } from 'commander';

import logger from './lib/logger';
import { getLastMessages } from './utils/message';
import { questionMessages } from './utils/llm';
import { createMongooseConnection } from './database';
import { exit } from 'process';
import MessageModel from './database/model/MessageModel';
import { calculateEmbedding } from './service/embedding/discord_processor';
import { aiClient } from './service/embedding/client';
import { config } from './config';

const program = new Command();

program
  .command('llm-question')
  .description('llm-question <question>')
  .argument('<question>', 'user prompt to llm')
  .requiredOption('-g, --guildId <string>', 'Guild ID')
  .requiredOption('-c, --channelId <string>', 'Channel ID')
  .option('-u, --userId <string>', 'User ID')
  .option(
    '--hour <number>',
    'fetch messages after last N hours',
    Number,
    undefined
  )
  .option('--count <number>', 'fetch last N messages', Number, 300)
  .action(async function (
    question,
    options: {
      guildId: string;
      channelId: string;
      hour?: number;
      count?: number;
    }
  ) {
    logger.info(`${JSON.stringify(options)} ${question}`);

    logger.info('create mongoose connection');
    await createMongooseConnection();

    const { guildId, channelId, hour, count } = options;

    const messages = await getLastMessages(guildId, channelId, hour, count);
    logger.info(`${messages.length} messages fetched`);

    if (messages.length === 0) {
      logger.info('no messages');
      exit(0);
    }

    const response = await questionMessages({
      logRequest: async (...logRequestArgs) => {
        logger.debug(logRequestArgs);
      },
      messages,
      question,
      skipSystemPrompt: true,
    });

    logger.info(response);
    exit(0);
  });

program
  .command('embedding')
  .description('calculate embedding fields manually')
  .option('--all', 'recalculate all messages if TEXT_ fields are exists')
  .action(async function (options: { all?: boolean }) {
    await createMongooseConnection();

    const concurrency = 10;
    let processed = 0;
    let skipped = 0;
    let failure = 0;

    logger.info(`${JSON.stringify(options)}`);
    const { all } = options;

    const mongoFindFilter = {
      isDeleted: { $ne: true },
      senderId: { $ne: '1149360270188220536' }, // bot id
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;
    if (!all) {
      mongoFindFilter.EMBEDDING_STATUS = { $eq: null };
    }

    const cursor = await MessageModel.find(mongoFindFilter, {
      _id: 1,
      guildId: 1,
      channelId: 1,
      messageId: 1,
      message: 1,
      EMBEDDING_INPUT: 1,
      TEXT_MESSAGE: 1,
      TEXT_ATTACHMENTS: 1,
      TEXT_COMPONENTS: 1,
      TEXT_EMBEDS: 1,
      createdAt: 1,
    })
      .sort({ createdAt: -1 })
      .cursor();

    const promises: Promise<void>[] = [];
    for await (const message of cursor) {
      promises.push(
        (async () => {
          try {
            if (message.EMBEDDING_INPUT) {
              const embedding = await aiClient.createEmbeddingText(
                message.EMBEDDING_INPUT
              );
              processed++;
              await MessageModel.updateOne(
                {
                  guildId: message.guildId,
                  channelId: message.channelId,
                  messageId: message.messageId,
                },
                {
                  $set: {
                    EMBEDDING_STATUS: true,
                    EMBEDDING_MODEL: config.EMBEDDING_OPENAI_MODEL,
                    EMBEDDING_DIM: embedding.length,
                    EMBEDDING: embedding,
                  },
                }
              );
            } else {
              const embeddingResult = await calculateEmbedding({
                TEXT_MESSAGE:
                  message.TEXT_MESSAGE ?? message.message ?? undefined,
                TEXT_ATTACHMENTS: message.TEXT_ATTACHMENTS,
                TEXT_COMPONENTS: message.TEXT_COMPONENTS,
                TEXT_EMBEDS: message.TEXT_EMBEDS,
              });

              if (!embeddingResult) {
                skipped++;
              } else {
                processed++;
                await MessageModel.updateOne(
                  {
                    guildId: message.guildId,
                    channelId: message.channelId,
                    messageId: message.messageId,
                  },
                  {
                    $set: {
                      TEXT_MESSAGE: embeddingResult.TEXT_MESSAGE,
                      EMBEDDING_STATUS: embeddingResult.EMBEDDING_STATUS,
                      EMBEDDING_MODEL: embeddingResult.EMBEDDING_MODEL,
                      EMBEDDING_DIM: embeddingResult.EMBEDDING_DIM,
                      EMBEDDING_INPUT: embeddingResult.EMBEDDING_INPUT,
                      EMBEDDING: embeddingResult.EMBEDDING,
                    },
                  }
                );
              }
            }
          } catch (error) {
            logger.error(`Embedding error ${error}. ${message.messageId}`);
            failure++;
            await MessageModel.updateOne(
              {
                guildId: message.guildId,
                channelId: message.channelId,
                messageId: message.messageId,
              },
              {
                $set: {
                  EMBEDDING_STATUS: false,
                },
              }
            );
          }
        })()
      );

      if (promises.length >= concurrency) {
        await Promise.all(promises);
        promises.length = 0;
        logger.debug(
          `Processed batch: ${processed} processed, ${failure} failed, ${skipped} skipped so far`
        );
      }
    }
  });

program.parse();
