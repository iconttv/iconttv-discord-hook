import { CommandInteraction, SlashCommandBuilder } from 'discord.js';
import logger from '../../lib/logger';
import { questionLastMessages } from '../messageService';

export const data = new SlashCommandBuilder()
  .setName('itvques')
  .setDescription('이전 대화내역을 기반으로 질문을 검색합니다.')
  .addStringOption(option =>
    option
      .setName('q')
      .setDescription('궁금한 것을 물어보세요.')
      .setRequired(true)
  )
  .addNumberOption(option =>
    option
      .setName('count')
      .setDescription('이전 n 건의 대화내역을 기반으로 검색합니다. 100 <= n <= 3000')
      .setMinValue(100)
      .setMaxValue(3000)
      .setRequired(false)
  );

export const execute = async (interaction: CommandInteraction) => {
  const rawQuestion = interaction.options.get('q')?.value;
  const rawCount = Number(interaction.options.get('count')?.value);
  const question = String(rawQuestion);

  logger.debug(
    `question: ${interaction.options.get('q')?.value}, count: ${
      interaction.options.get('count')?.value
    }`
  );

  if (!rawQuestion || question.length === 0) {
    await interaction.reply(`질문을 입력하세요.`);
    return;
  }

  let count;
  if (isNaN(rawCount)) {
    count = 2000;
  } else {
    count = Math.min(Math.max(rawCount, 100), 3000);
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

  const answer = await questionLastMessages(
    guildId,
    channelId,
    count,
    question
  );
  if (!answer) {
    await interaction.editReply(`답변을 생성할 수 없습니다.`);
    return;
  }

  const messageRangeText = `${count}개의`;
  try {
    await interaction.editReply(
      `최근 ${messageRangeText} 채팅에서 질의 결과:\n\nQ: ${question}\n\nA: ${answer}`
    );
  } catch (e) {
    logger.error(e);
  }
};
