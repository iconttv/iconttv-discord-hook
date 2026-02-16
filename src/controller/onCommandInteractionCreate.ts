import { ChatInputCommandInteraction } from 'discord.js';
import { readCommands } from '../service/commands/index';
import logger, { channel_log_message } from '../lib/logger';

export const onCommandInteractionCreate = async (
  interaction: ChatInputCommandInteraction
) => {
  const commandHandlers = (await readCommands())[1];

  const handler = commandHandlers[interaction.commandName];
  if (!handler) return;

  handler(interaction)
    .catch(e => {
      logger.error(
        channel_log_message(`Slash Command Reply Failed: ${e}`, interaction)
      );
    })
    .then(() => {
      logger.debug(
        channel_log_message('Slash Command Reply Succeed', interaction)
      );
    });
};
