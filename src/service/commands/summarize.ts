import { CommandInteraction, SlashCommandBuilder } from 'discord.js';
import logger from '../../lib/logger';
import { summarizeLastMessages } from '../messageService';

export const data = new SlashCommandBuilder()
  .setName('itvsumm')
  .setDescription('이전 대화 요약')
  .addNumberOption(option =>
    option
      .setName('hours')
      .setDescription('n 시간 전까지 대화 내용 요약. 1 <= n <= 12')
      .setRequired(false)
  )
  .addNumberOption(option =>
    option
      .setName('count')
      .setDescription('n 개의 대화 내용을 요약. 100 <= n <= 6000')
      .setRequired(false)
  );

export const execute = async (interaction: CommandInteraction) => {
  const rawHours = Number(interaction.options.get('hours')?.value);
  const rawCount = Number(interaction.options.get('count')?.value);

  let hours, count;
  if (isNaN(rawHours) && isNaN(rawCount)) {
    count = 1000;
  } else if (isNaN(rawHours)) {
    count = Math.min(Math.max(rawCount, 100), 6000);
  } else if (isNaN(rawCount)) {
    hours = Math.min(Math.max(rawHours, 1), 12);
  } else {
    await interaction.reply(`hours, count 둘 중 하나만 입력 가능합니다.`);
  }

  const channelId = interaction.channelId;
  const guildId = interaction.guildId;
  if (!guildId) {
    await interaction.reply(`해당 기능을 사용할 수 없는 대화방입니다.`);
    return;
  }

  // interaction should be <= 3 sec
  // otherwise should defer reply
  await interaction.deferReply();

  const summarization = await summarizeLastMessages(
    guildId,
    channelId,
    hours,
    count
  );
  if (!summarization) {
    await interaction.editReply(`요약을 생성할 수 없습니다.`);
  }

  const messageRangeText = hours ? `${hours}시간 내의` : `${count}개의`;
  try {
    await interaction.editReply(
      `최근 ${messageRangeText} 채팅 요약:\n\n${summarization}`
    );
  } catch (e) {
    logger.error(e);
  }
};
