import { Command } from 'commander';

import logger from './lib/logger';
import { getLastMessages } from './utils/message';
import { questionMessages } from './utils/llm';
import { createMongooseConnection } from './database';
import { exit } from 'process';
import MessageModel from './database/model/MessageModel';
import { processMessage } from './service/embedding/discord_processor';

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
  .action(async function (question, options) {
    logger.info(`${JSON.stringify(options)} ${question}`);

    logger.info('create mongoose connection');
    await createMongooseConnection();

    const { guildId, channelId, hour, count } = options as {
      guildId: string;
      channelId: string;
      hour?: number;
      count?: number;
    };

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
  .description('backfill embedding fields')
  .action(async function () {
    const cursor = await MessageModel.find(
      {
        isDeleted: { $ne: true },
        senderId: { $ne: '1149360270188220536' },
        EMBEDDING_STATUS: { $eq: null },
      },
      {
        _id: 1,
        guildId: 1,
        channelId: 1,
        messageId: 1,
        message: 1,
        attachments: 1,
        components: 1,
        embeds: 1,
        TEXT_MESSAGE: 1,
        TEXT_ATTACHMENTS: 1,
        TEXT_COMPONENTS: 1,
        TEXT_EMBEDS: 1,
        createdAt: 1,
      }
    )
      .sort({ createdAt: -1 })
      .cursor();

    const concurrency = 10;
    let processed = 0;
    let skipped = 0;
    let failure = 0;

    const promises: Promise<void>[] = [];
    for await (const message of cursor) {
      promises.push(
        (async () => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const result = await processMessage(message as unknown as any);
          if (!result) {
            //skip
            skipped++;
          } else if (!result.EMBEDDING_STATUS) {
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
                  EMBEDDING_STATUS: true,
                  EMBEDDING_MODEL: result.EMBEDDING_MODEL,
                  EMBEDDING_DIM: result.EMBEDDING_DIM,
                  EMBEDDING_INPUT: result.EMBEDDING_INPUT,
                  EMBEDDING: result.EMBEDDING,
                },
              }
            );
          }
        })()
      );

      if (promises.length >= concurrency) {
        await Promise.all(promises);
        promises.length = 0;
        logger.info(
          `Processed batch: ${processed} processed, ${failure} failed, ${skipped} skipped so far`
        );
      }
    }
  });

program.parse();
