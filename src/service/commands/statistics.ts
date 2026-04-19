import { ChatInputCommandInteraction, EmbedBuilder, SlashCommandBuilder } from "discord.js";
import logger from "../../lib/logger";
import { getMemberPortion } from "../elasticService";

export const data = new SlashCommandBuilder()
  .setName('itvstat')
  .setDescription('서버 내에서의 내 통계를 보여줍니다.')
  .addBooleanOption(option => option.setName('channel').setDescription('채널 내에서의 통계').setRequired(false))
.addBooleanOption(option => option.setName('keep')
      .setDescription(
        '메시지를 수 초 후에 자동으로 삭제합니다. keep=false 이라면 삭제하지 않습니다.'
      )
  .setRequired(false))


export const execute = async (interaction: ChatInputCommandInteraction) => { 
  const inChannel = interaction.options.get('channel')?.value ?? false;
  const keepMessage = interaction.options.get('keep')?.value ?? true;


  logger.debug(
    `[itvstat] channel: ${inChannel}, keepMessage: ${keepMessage}`
  );


  const guildId = interaction.guildId;
  const channelId = interaction.channelId;
  if (!guildId || (inChannel && !channelId)) {
    await interaction.reply(`해당 기능을 사용할 수 없는 대화방입니다.`);
    return;
  }

  const senderId = interaction.user.id
  await interaction.deferReply();
  try {
    const response = await getMemberPortion(
      guildId,
      senderId,
      inChannel ? channelId : undefined,
    )

    const scopeLabel = inChannel ? '현재 채널 기준' : '서버 전체 기준';
    const percentageText = response.percentage.toFixed(2);
    const senderCountText = response.senderCount.toLocaleString('ko-KR');
    const totalCountText = response.totalCount.toLocaleString('ko-KR');

    const embed = new EmbedBuilder()
      .setTitle('📊 내 메시지 통계')
      .setDescription(`${interaction.user}님의 메시지 비중입니다.`)
      .addFields(
        {
          name: '',
          value: scopeLabel,
          inline: true,
        },
        {
          name: '내 메시지 수',
          value: `${senderCountText}개`,
          inline: true,
        },
        {
          name: '전체 메시지 수',
          value: `${totalCountText}개`,
          inline: true,
        },
        {
          name: '점유율',
          value: `**${percentageText}%**`,
          inline: false,
        },
      )
      .setFooter({
        text: inChannel
          ? `채널 ID: ${channelId}`
          : `Guild ID: ${guildId}`,
      })
      .setTimestamp();

    await interaction.editReply({
      embeds: [embed],
    });
    
    if (!keepMessage) {
      setTimeout(async () => {
        try {
          await interaction.deleteReply();
        } catch (error) {
          logger.warn(`[itvstat] failed to delete reply: ${error}`);
        }
      }, 3 * 60 * 1000);
    }
  } catch (e) {
    logger.error(e);
    await interaction.editReply({
      content: '통계를 가져오는 중 에러가 발생했습니다.',
    });
  }

}
