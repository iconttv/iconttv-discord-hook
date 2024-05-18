import {
  CommandInteraction,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('itvsetting')
  .setDescription('디시콘봇 설정')
  .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers);

export const execute = async (interaction: CommandInteraction) => {
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ModerateMembers))
    return;

  await interaction.reply('디시콘봇 설정');
};
