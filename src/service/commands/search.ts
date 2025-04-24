import { CommandInteraction, SlashCommandBuilder } from 'discord.js';
import logger from '../../lib/logger';
import { searchMessage } from '../searchService';
import { trimText, truncateText } from '../../utils';

export const data = new SlashCommandBuilder()
  .setName('itvsc')
  .setDescription('대화내용 검색')
  .addStringOption(option =>
    option.setName('keyword').setDescription('검색어').setRequired(true)
  )
  .addBooleanOption(option =>
    option
      .setName('channel')
      .setDescription('현재 채널 내에서만 검색')
      .setRequired(false)
  );

export const execute = async (interaction: CommandInteraction) => {
  const keyword = interaction.options.get('keyword')?.value?.toString() ?? '';
  const inChannel = interaction.options.get('channel')?.value ?? false;
  logger.debug(`keyword: ${keyword}, channel: ${inChannel}`);

  if (!keyword || keyword.length === 0) {
    await interaction.reply(`검색어가 입력되지 않았습니다.`);
    return;
  }

  const guildId = interaction.guildId;
  const channelId = interaction.channelId;
  if (!guildId || (inChannel && !channelId)) {
    await interaction.reply(`해당 기능을 사용할 수 없는 대화방입니다.`);
    return;
  }

  await interaction.deferReply();
  try {
    const searchResult = await searchMessage(
      guildId,
      keyword,
      inChannel ? channelId : null
    );
    const beautifulMessage = searchResult
      .map(
        result =>
          `- [${result['@timestamp']}] ${truncateText(
            trimText(result.message),
            30
          )} ${result.link}`
      )
      .join('\n');
    await interaction.editReply(
      beautifulMessage.length ? beautifulMessage : '검색 결과가 없습니다.'
    );
  } catch (e) {
    logger.error(e);
    await interaction.editReply('검색 기능에 에러가 발생했습니다.');
  }
};
