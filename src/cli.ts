import { Command } from 'commander';

import logger from './lib/logger';
import { getLastMessages } from './utils/message';
import { questionMessages } from './utils/llm';
import { createMongooseConnection } from './database';
import { exit } from 'process';

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
    parseInt,
    undefined
  )
  .option('--count <number>', 'fetch last N messages', parseInt, 300)
  .action(async function (question, options) {
    logger.info(`${question} ${JSON.stringify(options)}`);

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
    });

    logger.info(response);
    exit(0);
  });

program.parse();
