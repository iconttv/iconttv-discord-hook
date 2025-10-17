import { CommandInteraction, SlashCommandBuilder } from 'discord.js';
import logger from '../../lib/logger';
import { generateImageFromUser } from '../imageService';
import { replyMessagePerError } from '../../utils/error';
import {
  base64ImageToAttachment,
  createUserProfileEmbed,
} from '../../utils/discord/index';

export const data = new SlashCommandBuilder()
  .setName('itvimgen')
  .setDescription('주어진 설명으로부터 이미지를 생성합니다.')
  .addStringOption(option =>
    option.setName('p').setDescription('이미지에 대한 설명').setRequired(true)
  );

export const execute = async (interaction: CommandInteraction) => {
  const rawPrompt = interaction.options.get('p')?.value;

  const prompt = String(rawPrompt);

  logger.debug(`image prompt: ${prompt} `);

  const channelId = interaction.channelId;
  const guildId = interaction.guildId;
  const senderId = interaction.member?.user.id;
  if (!guildId) {
    await interaction.reply(`해당 기능을 사용할 수 없는 대화방입니다.`);
    return;
  }

  const start = Date.now();
  await interaction.deferReply();

  let model: string, imageUrls: string[], executionTimeSecMessage: string;
  try {
    [model, imageUrls] = await generateImageFromUser(
      guildId,
      channelId,
      senderId,
      prompt
    );
  } catch (e) {
    logger.error(e);
    executionTimeSecMessage = `(${((Date.now() - start) / 1000).toFixed(
      2
    )}초 소요됨) `;
    await replyMessagePerError(
      e,
      `이미지를 생성할 수 없습니다. ${executionTimeSecMessage}`,
      interaction.editReply.bind(interaction)
    );
    return;
  }

  if (!imageUrls) {
    executionTimeSecMessage = `(${((Date.now() - start) / 1000).toFixed(
      2
    )}초 소요됨) `;
    await interaction.editReply(
      `이미지를 생성할 수 없습니다. ${executionTimeSecMessage}[001]`
    );
    return;
  }

  try {
    executionTimeSecMessage = `(${((Date.now() - start) / 1000).toFixed(
      2
    )}초 소요됨) `;

    const userProfileEmbed = createUserProfileEmbed(interaction);

    const attachments = imageUrls.map(imageUrl =>
      base64ImageToAttachment(imageUrl, { spoiler: true })
    );
    await interaction.editReply({
      embeds: [
        userProfileEmbed.setDescription(
          `${prompt}\n${model} ${executionTimeSecMessage}`
        ),
        // .setImage(`attachment://${attachment.name}`),
        // disable in order to make spoiler image
      ],
      files: attachments,
    });
  } catch (e) {
    logger.error(e);
    executionTimeSecMessage = `(${((Date.now() - start) / 1000).toFixed(
      2
    )}초 소요됨) `;
    await interaction.editReply(
      `생성한 이미지를 전송할 수 없습니다. ${executionTimeSecMessage}[002]`
    );
  }
};
