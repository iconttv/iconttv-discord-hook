import { Interaction } from 'discord.js';
import { setGuildSetting } from '../service/settingService';

export const onModalSubmit = async (interaction: Interaction) => {
  if (!interaction.isModalSubmit()) return;

  if (interaction.customId === 'setting') {
    const enableFeatureIconImageResizeValue =
      interaction.fields.getTextInputValue('enableFeatureIconImageResize');
    const enableCommandQuestionForEveryoneValue =
      interaction.fields.getTextInputValue('enableCommandQuestionForEveryone');

    const enableFeatureIconImageResize =
      typeof enableFeatureIconImageResizeValue === 'string' &&
      enableFeatureIconImageResizeValue.length > 0
        ? enableFeatureIconImageResizeValue === '1'
        : undefined;

    const enableCommandQuestionForEveryone =
      typeof enableCommandQuestionForEveryoneValue === 'string' &&
      enableCommandQuestionForEveryoneValue.length > 0
        ? enableCommandQuestionForEveryoneValue === '1'
        : undefined;

    await setGuildSetting(interaction, {
      enableCommandQuestionForEveryone,
      enableFeatureIconImageResize,
    });
    await interaction.reply({
      content: '설정 저장 완료! 이 메시지는 잠시 뒤 사라집니다.',
    });
    setTimeout(() => interaction.deleteReply(), 5 * 1000);
  }
};
