import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';
import logger from '../../lib/logger';
import { searchMessage, searchMessageEmbedding } from '../searchService';
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
  )
  .addBooleanOption(option =>
    option
      .setName('embedding')
      .setDescription('use embedding vector')
      .setRequired(false)
  )
  .addBooleanOption(option =>
    option
      .setName('keep')
      .setDescription(
        '기본 설정으로 메시지를 수 초 후에 자동으로 삭제합니다. keep=True 이라면 삭제하지 않습니다.'
      )
      .setRequired(false)
  );

export const execute = async (interaction: ChatInputCommandInteraction) => {
  const keyword = interaction.options.get('keyword')?.value?.toString() ?? '';
  const inChannel = interaction.options.get('channel')?.value ?? false;
  const useEmbedding = interaction.options.get('embedding')?.value ?? false;
  const keepMessage = interaction.options.get('keep')?.value ?? false;

  logger.debug(
    `keyword: ${keyword}, channel: ${inChannel}, useEmbedding: ${useEmbedding}, keepMessage: ${keepMessage}`
  );

  const searchWord = keyword.trim();

  if (!searchWord) {
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

  let searchResult:
    | {
        '@timestamp': string;
        message: string;
        link: string;
      }[]
    | null = null;

  /**
   * 대부분 경우에 텍스트 검색이 더 효율적임.
   */
  if (useEmbedding) {
    try {
      searchResult = await searchMessageEmbedding(
        guildId,
        searchWord,
        inChannel ? channelId : null
      );
    } catch (e) {
      logger.warn('embedding search failed.');
      logger.warn(e);
    }
  } else {
    try {
      searchResult = await searchMessage(
        guildId,
        searchWord,
        inChannel ? channelId : null
      );
    } catch (e) {
      logger.error('fuzzy search failed.');
      logger.error(e);
    }
  }

  if (searchResult === null) {
    await interaction.editReply('검색 기능에 에러가 발생했습니다.');
  } else if (searchResult.length === 0) {
    await interaction.editReply('검색 결과가 없습니다.');
  } else {
    const beautifulMessage = searchResult
      .map(
        result =>
          `- ${truncateText(trimText(result.message), 30)} ${result.link} (${
            result['@timestamp']
          })`
      )
      .join('\n');
    await interaction.editReply(beautifulMessage);
  }

  if (!keepMessage) {
    setTimeout(() => {
      interaction.deleteReply();
    }, 3 * 60 * 1000);
  }
};
