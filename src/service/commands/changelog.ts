import { CommandInteraction, SlashCommandBuilder } from 'discord.js';
import logger from '../../lib/logger.js';
import { config } from '../../config.js';

export const data = new SlashCommandBuilder()
  .setName('itvchangelog')
  .setDescription('가장 최근 변경 사항을 보여줍니다.');

export const execute = async (interaction: CommandInteraction) => {
  const latestChangeLog = await fetch(
    `${config.GITHUB_BASEURL}/docs/lastChangelog.md`
  )
    .then(res => res.text())
    .catch(e => {
      logger.error(e);
      return '최근 변경 사항을 불러올 수 없습니다.';
    });

  await interaction.reply(latestChangeLog);
};
