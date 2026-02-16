import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';
import { getLogContext } from '../../utils/discord';

export const data = new SlashCommandBuilder()
  .setName('whoami')
  .setDescription('whoami');

export const execute = async (interaction: ChatInputCommandInteraction) => {
  const context = getLogContext(interaction);
  if (!context) {
    await interaction.reply('채널 정보를 확인할 수 없습니다.');
  } else {
    let message = `${context.guildName}:${context.guildId}`;
    message += ` ${context.channelName}:${context.channelId}`;
    message += ` ${context.senderName}:${context.senderId}`;

    await interaction.reply(message);
  }

  setTimeout(() => {
    interaction.deleteReply();
  }, 15 * 1000);
};
