import { CommandInteraction, SlashCommandBuilder } from 'discord.js';
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
  );

export const execute = async (interaction: CommandInteraction) => {
  const keyword = interaction.options.get('keyword')?.value?.toString() ?? '';
  const inChannel = interaction.options.get('channel')?.value ?? false;
  logger.debug(`keyword: ${keyword}, channel: ${inChannel}`);

  const searchWord = keyword.trim();

  if (!searchWord || searchWord.length === 0) {
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
   * if keyword is just one word or some short word,
   * cosine similarity score is too high in meaning less results.
   */
  const useEmbeddingSearch =
    searchWord.length > 10 || searchWord.split(' ').length > 1;

  if (useEmbeddingSearch) {
    try {
      searchResult = await searchMessageEmbedding(
        guildId,
        searchWord,
        inChannel ? channelId : null
      );
      logger.debug('search result found from embedding search');
      if (!searchResult || searchResult.length === 0) {
        throw new Error('embedding search result is empty');
      }
    } catch (e) {
      logger.warn('embedding search failed. fallback to fuzzy search.');
      logger.warn(e);
      searchResult = null;
    }
  }

  if (searchResult === null) {
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
          `- [${result['@timestamp']}] ${truncateText(
            trimText(result.message),
            30
          )} ${result.link}`
      )
      .join('\n');
    await interaction.editReply(beautifulMessage);
  }
};
