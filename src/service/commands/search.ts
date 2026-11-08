import {
  ChatInputCommandInteraction,
  InteractionContextType,
  SlashCommandBuilder,
} from 'discord.js';
import { replyWithWebLink } from '../webLinkService';

export const data = new SlashCommandBuilder()
  .setName('itvsc')
  .setDescription('대화내용 검색')
  .setContexts(InteractionContextType.Guild)
  .addStringOption(option =>
    option
      .setName('keyword')
      .setDescription('검색어 (생략하면 최근 메시지)')
      .setRequired(false)
      .setMaxLength(180)
  )
  .addBooleanOption(option =>
    option
      .setName('channel')
      .setDescription('현재 채널 내에서만 검색 (기본값: true)')
      .setRequired(false)
  )
  .addBooleanOption(option =>
    option
      .setName('embedding')
      .setDescription('임베딩 검색 사용')
      .setRequired(false)
  );

export const execute = async (interaction: ChatInputCommandInteraction) => {
  await replyWithWebLink(interaction, {
    keyword: interaction.options.getString('keyword')?.trim(),
    inChannel: interaction.options.getBoolean('channel') ?? true,
    semantic: interaction.options.getBoolean('embedding') ?? false,
    fallbackToMessages: true,
  });
};
