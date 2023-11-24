import {
  REST,
  RESTGetAPIApplicationGuildCommandsResult,
  Routes,
} from 'discord.js';
import { config } from './utils/config';
import logger from './lib/logger';
import { readCommands } from './service/commands';

// https://discordjs.guide/creating-your-bot/command-deployment.html#where-to-deploy

const rest = new REST().setToken(config.DISCORD_BOT_TOKEN);

const purgeCommands = async () => {
  try {
    logger.info(`Started deleting application (/) commands.`);

    const commands = (await rest.get(
      Routes.applicationCommands(config.DISCORD_CLIENT_ID)
    )) as RESTGetAPIApplicationGuildCommandsResult;

    for (const command of commands) {
      await rest.delete(
        Routes.applicationCommand(config.DISCORD_CLIENT_ID, command.id)
      );
    }

    logger.info(
      `Successfully deleted ${commands.length} application (/) commands.`
    );
  } catch (error) {
    logger.error(error);
  }
};

const registerCommands = async () => {
  try {
    const commands = (await readCommands())[0];

    logger.info(
      `Started refreshing ${commands.length} application (/) commands.`
    );

    const data = (await rest.put(
      Routes.applicationCommands(config.DISCORD_CLIENT_ID),
      { body: commands }
    )) as unknown[];

    logger.info(
      `Successfully reloaded ${data.length} application (/) commands.`
    );
  } catch (error) {
    logger.error(error);
  }
};

(async () => {
  await purgeCommands();
  await registerCommands();
})();
