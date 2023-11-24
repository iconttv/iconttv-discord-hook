import {
  CommandInteraction,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('itvlist')
  .setDescription('현재 채널에서 사용 중인 디시콘 소유자 목록을 보여줍니다.')
  .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers);

export const execute = async (interaction: CommandInteraction) => {
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ModerateMembers))
    return;

  await interaction.reply('관리자역할');
};
