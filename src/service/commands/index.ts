import {
  SlashCommandBuilder,
  Interaction,
  RESTPostAPIApplicationCommandsJSONBody,
} from 'discord.js';
import { readdirSync } from 'fs';
import path from 'path';
import logger from '../../lib/logger';

type SlashCommandHandler = (interaction: Interaction) => Promise<void>;

interface SlashCommand {
  data: SlashCommandBuilder;
  execute: SlashCommandHandler;
}

export const readCommands = (() => {
  const cachedCommands: RESTPostAPIApplicationCommandsJSONBody[] = [];
  const cachedCommandHandler: Record<string, SlashCommandHandler> = {};

  return async (): Promise<
    [
      RESTPostAPIApplicationCommandsJSONBody[],
      Record<string, SlashCommandHandler>
    ]
  > => {
    if (cachedCommands.length && Object.keys(cachedCommandHandler).length)
      return [cachedCommands, cachedCommandHandler];

    const foldersPath = path.resolve(__dirname);

    const commandFiles = readdirSync(foldersPath).filter(
      file =>
        !file.endsWith(__filename.split('/').pop() || 'index.ts') &&
        !file.startsWith('_') &&
        file.endsWith('.ts')
    );

    for (const file of commandFiles) {
      const filePath = path.join(foldersPath, file);
      const commandConfig = (await import(filePath)) as SlashCommand;

      logger.debug(JSON.stringify(commandConfig));

      if ('data' in commandConfig && 'execute' in commandConfig) {
        cachedCommands.push(commandConfig.data.toJSON());
        cachedCommandHandler[commandConfig.data.name] = commandConfig.execute;
      } else {
        logger.warn(
          `The command at ${filePath} is missing a required "data" or "execute" property.`
        );
      }
    }

    return [cachedCommands, cachedCommandHandler];
  };
})();
