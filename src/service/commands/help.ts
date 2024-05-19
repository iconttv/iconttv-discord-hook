import { CommandInteraction, SlashCommandBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('itvhelp')
  .setDescription('디시콘봇 도움말을 보여줍니다.');

export const execute = async (interaction: CommandInteraction) => {
  // interaction.user is the object representing the User who ran the command
  // interaction.member is the GuildMember object, which represents the user in the specific guild
  await interaction.reply(
    `디스코드에서 '~' 명령어를 사용하여 디시콘을 보여줍니다.` + 
    `\n소스코드: https://github.com/iconttv/iconttv-discord-hook`
  );
};
