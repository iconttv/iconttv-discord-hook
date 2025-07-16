import {
  CommandInteraction,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js';
import logger from '../../lib/logger';
import { questionLastMessages } from '../messageService';
import { rejectGPTRequestAndGetMessage } from '../../utils/auth';
import { replyMessagePerError } from '../../utils/error';
import { getGuildSetting } from '../settingService';

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
      .setDescription(
        '이전 n 건의 대화내역을 기반으로 검색합니다. 100 <= n <= 1000.' +
          ' 너무 많은 양을 요청할 시 요약이 불가능할 수 있습니다.'
      )
      .setMinValue(100)
      .setMaxValue(1000)
      .setRequired(false)
  );

export const execute = async (interaction: CommandInteraction) => {
  const guildSetting = await getGuildSetting(interaction);
  if (
    !interaction.memberPermissions?.has(PermissionFlagsBits.ModerateMembers) &&
    !guildSetting?.enableCommandQuestionForEveryone
  ) {
    await interaction.reply(`해당 기능을 실행할 권한이 부족합니다.`);
    return;
  }

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
    count = 500;
  } else {
    count = Math.min(Math.max(rawCount, 100), 1000);
  }

  const channelId = interaction.channelId;
  const guildId = interaction.guildId;

  if (!guildId) {
    await interaction.reply(`해당 기능을 사용할 수 없는 대화방입니다.`);
    return;
  }

  const rejectMessage = await rejectGPTRequestAndGetMessage(guildId);
  if (rejectMessage !== undefined) {
    await interaction.reply(rejectMessage);
    return;
  }

  // interaction should be <= 3 sec
  // otherwise should defer reply
  await interaction.deferReply();

  let answer;
  try {
    answer = await questionLastMessages(
      guildId,
      channelId,
      interaction.member?.user.id,
      count,
      question
    );
  } catch (e) {
    logger.error(e);
    await replyMessagePerError(
      e,
      '답변을 생성할 수 없습니다.',
      interaction.editReply.bind(interaction)
    );
    return;
  }
  if (!answer) {
    await interaction.editReply(`답변을 생성할 수 없습니다. [001]`);
    return;
  }

  const messageRangeText = `${count}개의`;
  try {
    await interaction.editReply(
      `최근 ${messageRangeText} 채팅에서 질의 결과:\n\nQ: ${question}\n\nA: ${answer}`
    );
  } catch (e) {
    logger.error(e);
    await interaction.editReply(`생성한 답변을 전송할 수 없습니다. [002]`);
  }
};
