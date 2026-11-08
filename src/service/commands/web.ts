import {
  ChatInputCommandInteraction,
  InteractionContextType,
  SlashCommandBuilder,
} from 'discord.js';
import { replyWithWebLink } from '../webLinkService';

export const data = new SlashCommandBuilder()
  .setName('itvweb')
  .setDescription('대화 검색과 서버 설정 웹 열기')
  .setContexts(InteractionContextType.Guild);

export const execute = async (interaction: ChatInputCommandInteraction) => {
  await replyWithWebLink(interaction);
};
