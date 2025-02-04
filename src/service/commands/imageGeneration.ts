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
  .setDescription(
    '주어진 설명으로부터 이미지를 생성합니다. 사회적으로 문제가 될 만한 이미지는 요청하지 마세요.'
  )
  .addStringOption(option =>
    option.setName('p').setDescription('이미지에 대한 설명').setRequired(true)
  )
  .addNumberOption(option =>
    option
      .setName('s')
      .setDescription(
        '서비스 제공자. 1: openai, 2: novelai. (기본값: 1. 프롬프트에 `anime` 존재할 시 2)'
      )
      .setMinValue(1)
      .setMaxValue(2)
      .setRequired(false)
  );

const serviceProviders = {
  1: 'openai',
  2: 'novelai',
} as const;

export const execute = async (interaction: CommandInteraction) => {
  const rawPrompt = interaction.options.get('p')?.value;
  const rawServiceProvider = Number(interaction.options.get('s')?.value);

  const prompt = String(rawPrompt);

  if (prompt.length > 300) {
    await interaction.reply('설명이 너무 길어서 이미지를 생성할 수 없어요.');
    return;
  }

  const serviceProvider = (() => {
    if (Number.isNaN(rawServiceProvider)) {
      return prompt.includes('anime')
        ? serviceProviders[2]
        : serviceProviders[1];
    }
    return serviceProviders[
      rawServiceProvider as keyof typeof serviceProviders
    ];
  })();

  logger.debug(`[${serviceProvider}] image prompt: ${prompt} `);

  const channelId = interaction.channelId;
  const guildId = interaction.guildId;
  const senderId = interaction.member?.user.id;
  if (!guildId) {
    await interaction.reply(`해당 기능을 사용할 수 없는 대화방입니다.`);
    return;
  }

  const start = Date.now();
  await interaction.deferReply();

  let imageUrl, revisedPrompt, executionTimeSecMessage;
  try {
    [imageUrl, revisedPrompt] = await generateImageFromUser(
      guildId,
      channelId,
      senderId,
      prompt,
      serviceProvider
    );
  } catch (e) {
    logger.error(e);
    executionTimeSecMessage = `(${((Date.now() - start) / 1000).toFixed(
      2
    )}초 소요됨) `;
    await replyMessagePerError(
      e,
      `[${serviceProvider}] 이미지를 생성할 수 없습니다. ${executionTimeSecMessage}`,
      interaction.editReply.bind(interaction)
    );
    return;
  }

  if (!imageUrl) {
    executionTimeSecMessage = `(${((Date.now() - start) / 1000).toFixed(
      2
    )}초 소요됨) `;
    await interaction.editReply(
      `[${serviceProvider}] 이미지를 생성할 수 없습니다. ${executionTimeSecMessage}[001]`
    );
    return;
  }

  try {
    executionTimeSecMessage = `(${((Date.now() - start) / 1000).toFixed(
      2
    )}초 소요됨) `;

    const userProfileEmbed = createUserProfileEmbed(interaction);

    if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
      await interaction.editReply({
        embeds: [
          userProfileEmbed
            .setDescription(
              `[${serviceProvider}] ${prompt}\n  =>  ${revisedPrompt} ${executionTimeSecMessage}`
            )
            .setImage(imageUrl),
        ],
      });
    } else {
      const attachment = base64ImageToAttachment(imageUrl, { spoiler: true });

      await interaction.editReply({
        embeds: [
          userProfileEmbed.setDescription(
            `[${serviceProvider}] ${prompt}\n  =>  ${revisedPrompt} ${executionTimeSecMessage}`
          ),
          // .setImage(`attachment://${attachment.name}`),
          // disable in order to make spoiler image
        ],
        files: [attachment],
      });
    }
  } catch (e) {
    logger.error(e);
    executionTimeSecMessage = `(${((Date.now() - start) / 1000).toFixed(
      2
    )}초 소요됨) `;
    await interaction.editReply(
      `[${serviceProvider}] 생성한 이미지를 전송할 수 없습니다. ${executionTimeSecMessage}[002]`
    );
  }
};
