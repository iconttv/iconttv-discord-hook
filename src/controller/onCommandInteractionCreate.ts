import { CommandInteraction, Interaction } from 'discord.js';
import { readCommands } from '../service/commands/index.js';
import logger, { channel_log_message } from '../lib/logger.js';

export const onCommandInteractionCreate = async (interaction: Interaction) => {
  if (!interaction.isCommand()) return;

  const commandInteraction = interaction as unknown as CommandInteraction;
  const commandHandlers = (await readCommands())[1];

  const handler = commandHandlers[commandInteraction.commandName];
  if (!handler) return;

  handler(interaction)
    .catch(e => {
      logger.error(
        channel_log_message(
          `Slash Command Reply Failed: ${e}`,
          commandInteraction
        )
      );
    })
    .then(() => {
      logger.debug(
        channel_log_message('Slash Command Reply Succeed', commandInteraction)
      );
    });
};
