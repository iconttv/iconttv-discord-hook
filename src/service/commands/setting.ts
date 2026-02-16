import {
  ActionRowBuilder,
  ChatInputCommandInteraction,
  InteractionContextType,
  ModalActionRowComponentBuilder,
  ModalBuilder,
  PermissionFlagsBits,
  SlashCommandBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { getGuildSetting } from '../settingService';

export const data = new SlashCommandBuilder()
  .setName('itvsetting')
  .setDescription('디시콘봇 설정')
  .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
  .setContexts(InteractionContextType.Guild);

export const execute = async (interaction: ChatInputCommandInteraction) => {
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ModerateMembers))
    return;

  const guildSetting = await getGuildSetting(interaction);

  const modal = new ModalBuilder()
    .setCustomId('setting')
    .setTitle('디시콘봇 설정');

  const enableFeatureIconImageResizeInput = new TextInputBuilder()
    .setCustomId('enableFeatureIconImageResize')
    .setMaxLength(1)
    .setStyle(TextInputStyle.Short)
    .setValue(guildSetting?.enableFeatureIconImageResize ? '1' : '0')
    .setLabel('200px 이하 이미지 임베디드메시지로 변환. 1: on, 0: off');

  const enableCommandQuestionForEveryoneInput = new TextInputBuilder()
    .setCustomId('enableCommandQuestionForEveryone')
    .setMaxLength(1)
    .setStyle(TextInputStyle.Short)
    .setValue(guildSetting?.enableCommandQuestionForEveryone ? '1' : '0')
    .setLabel('/itvques 모든유저 사용 (1: on, 0: off)');

  const enableFeatureIconImageResizeRow =
    new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(
      enableFeatureIconImageResizeInput
    );
  const enableCommandQuestionForEveryoneRow =
    new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(
      enableCommandQuestionForEveryoneInput
    );

  modal.addComponents(
    enableFeatureIconImageResizeRow,
    enableCommandQuestionForEveryoneRow
  );

  await interaction.showModal(modal);
};
