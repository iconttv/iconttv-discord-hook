import { CommandInteraction, SlashCommandBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('itvhelp')
  .setDescription('디시콘봇 도움말을 보여줍니다.');

export const execute = async (interaction: CommandInteraction) => {
  // interaction.user is the object representing the User who ran the command
  // interaction.member is the GuildMember object, which represents the user in the specific guild
  await interaction.reply(
    `This command was run by ${interaction.user.username}.`
  );
};
