import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';
import logger from '../../lib/logger';
import { generateImageFromUser } from '../imageService';
import { replyMessagePerError } from '../../utils/error';
import {
  base64ImageToAttachment,
  createUserProfileEmbed,
} from '../../utils/discord/index';
import { aiClient } from '../embedding/client';

export const data = new SlashCommandBuilder()
  .setName('itvimgen')
  .setDescription('주어진 설명으로부터 이미지를 생성합니다.')
  .addStringOption(option =>
    option.setName('p').setDescription('이미지에 대한 설명').setRequired(true)
  )
  .addAttachmentOption(option =>
    option
      .setName('iedit')
      .setDescription('수정할 이미지 (1)')
      .setRequired(false)
  )
  .addAttachmentOption(option =>
    option
      .setName('iref1')
      .setDescription('레퍼런스 이미지1 (2)')
      .setRequired(false)
  )
  .addAttachmentOption(option =>
    option
      .setName('iref2')
      .setDescription('레퍼런스 이미지2 (3)')
      .setRequired(false)
  )
  .addAttachmentOption(option =>
    option
      .setName('iref3')
      .setDescription('레퍼런스 이미지3 (4)')
      .setRequired(false)
  );

export const execute = async (interaction: ChatInputCommandInteraction) => {
  const rawPrompt = interaction.options.get('p')?.value;

  const imageEdit = interaction.options.get('iedit')?.attachment;
  const imageRef1 = interaction.options.get('iref1')?.attachment;
  const imageRef2 = interaction.options.get('iref2')?.attachment;
  const imageRef3 = interaction.options.get('iref3')?.attachment;

  const prompt = String(rawPrompt);

  logger.debug(
    `image prompt: ${prompt}, imageEdit: ${imageEdit !== undefined}, ref1: ${
      imageRef1 !== undefined
    }, ref2: ${imageRef2 !== undefined}, ref3: ${imageRef3 !== undefined} `
  );

  const channelId = interaction.channelId;
  const guildId = interaction.guildId;
  const senderId = interaction.member?.user.id;
  if (!guildId) {
    await interaction.reply(`해당 기능을 사용할 수 없는 대화방입니다.`);
    return;
  }

  const start = Date.now();
  const getExecutionTimeSecMessage = () =>
    `(${((Date.now() - start) / 1000).toFixed(2)}초 소요됨) `;
  await interaction.deferReply();

  const imageInputUrls: string[] = [];

  const pushAttachmentImageToInput = async (
    attachment: { proxyURL: string } | null | undefined,
    failMessage: string
  ) => {
    if (!attachment) {
      return true;
    }

    try {
      imageInputUrls.push(
        await aiClient.imageToBase64(attachment.proxyURL, 1024)
      );
      return true;
    } catch {
      await interaction.reply(failMessage);
      return false;
    }
  };

  if (
    !(await pushAttachmentImageToInput(
      imageEdit,
      `수정할 이미지를 처리할 수 없습니다`
    ))
  ) {
    return;
  }
  if (
    !(await pushAttachmentImageToInput(
      imageRef1,
      `레퍼런스 이미지1를 처리할 수 없습니다`
    ))
  ) {
    return;
  }
  if (
    !(await pushAttachmentImageToInput(
      imageRef2,
      `레퍼런스 이미지2를 처리할 수 없습니다`
    ))
  ) {
    return;
  }
  if (
    !(await pushAttachmentImageToInput(
      imageRef3,
      `레퍼런스 이미지3를 처리할 수 없습니다`
    ))
  ) {
    return;
  }

  let model: string, imageUrls: string[], executionTimeSecMessage: string;
  try {
    [model, imageUrls] = await generateImageFromUser(
      guildId,
      channelId,
      senderId,
      prompt,
      imageInputUrls
    );
  } catch (e) {
    logger.error(e);
    executionTimeSecMessage = getExecutionTimeSecMessage();
    await replyMessagePerError(
      e,
      `이미지를 생성할 수 없습니다. ${executionTimeSecMessage}`,
      interaction.editReply.bind(interaction)
    );
    return;
  }

  if (!imageUrls) {
    executionTimeSecMessage = getExecutionTimeSecMessage();
    await interaction.editReply(
      `이미지를 생성할 수 없습니다. ${executionTimeSecMessage}[001]`
    );
    return;
  }

  try {
    executionTimeSecMessage = getExecutionTimeSecMessage();

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
    executionTimeSecMessage = getExecutionTimeSecMessage();
    await interaction.editReply(
      `생성한 이미지를 전송할 수 없습니다. ${executionTimeSecMessage}[002]`
    );
  }
};
