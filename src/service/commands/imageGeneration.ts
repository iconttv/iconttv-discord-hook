import { CommandInteraction, SlashCommandBuilder } from 'discord.js';
import logger from '../../lib/logger';
import { generateImageFromUser } from '../imageService';
import { replyMessagePerError } from '../../utils/openai';
import { createUserProfileEmbed } from '../../utils/discord';

export const data = new SlashCommandBuilder()
  .setName('itvimgen')
  .setDescription(
    '주어진 설명으로부터 이미지를 생성합니다. 사회적으로 문제가 될 만한 이미지는 요청하지 마세요. (베타)'
  )
  .addStringOption(option =>
    option.setName('p').setDescription('이미지에 대한 설명').setRequired(true)
  );

export const execute = async (interaction: CommandInteraction) => {
  const rawPrompt = interaction.options.get('p')?.value;
  const prompt = String(rawPrompt);

  if (prompt.length > 300) {
    await interaction.reply('설명이 너무 길어서 이미지를 생성할 수 없어요.');
    return;
  }
  logger.debug(`image prompt: ${interaction.options.get('p')?.value}`);

  const channelId = interaction.channelId;
  const guildId = interaction.guildId;
  const senderId = interaction.member?.user.id;
  if (!guildId) {
    await interaction.reply(`해당 기능을 사용할 수 없는 대화방입니다.`);
    return;
  }

  await interaction.deferReply();
  let imageUrl, revisedPrompt;
  try {
    [imageUrl, revisedPrompt] = await generateImageFromUser(
      guildId,
      channelId,
      senderId,
      prompt
    );
  } catch (e) {
    await replyMessagePerError(
      e,
      '이미지를 생성할 수 없습니다.',
      interaction.editReply
    );
    return;
  }

  if (!imageUrl) {
    await interaction.editReply(`이미지를 생성할 수 없습니다. [001]`);
    return;
  }

  try {
    const userProfileEmbed = createUserProfileEmbed(interaction);
    await interaction.editReply({
      embeds: [
        userProfileEmbed
          .setDescription(`${prompt}\n  =>  ${revisedPrompt}`)
          .setImage(imageUrl),
      ],
    });
  } catch (e) {
    logger.error(e);
    await interaction.editReply(`생성한 이미지를 전송할 수 없습니다. [002]`);
  }
};
