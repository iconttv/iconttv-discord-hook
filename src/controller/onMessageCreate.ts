import { Message, AttachmentBuilder, MessageFlags } from "discord.js";
import {
  getGuildMemberFromMessage,
  createUserProfileEmbed,
  getSenderName,
  isAnonMessage,
} from "../utils/discord";
import { parseIconSearchKeyword } from "../utils";
import IconSearchEngine from "../repository/search/IconSearchEngine";

export async function onMessageCreate(message: Message) {
  const { content: messageText } = message;

  const searchKeyword = parseIconSearchKeyword(messageText);
  if (!searchKeyword) return;

  const guildMember = getGuildMemberFromMessage(message);
  if (!guildMember) return;

  const sender = getSenderName(guildMember);

  const matchIcon = await IconSearchEngine.instance.searchIcon(
    searchKeyword,
    guildMember.guild.id
  );
  if (!matchIcon) return;

  console.log(
    `"${sender}": "${messageText}" @ ${guildMember.guild.id}`
  );

  const userProfileEmbed = createUserProfileEmbed(message, {
    asAnonUser: isAnonMessage(messageText),
  });

  if (matchIcon.isRemoteImage) {
    await Promise.all([
      message.channel.send({
        flags: MessageFlags.SuppressNotifications,
        embeds: [
          userProfileEmbed
            .setDescription(matchIcon.keywords[0])
            .setImage(matchIcon.imagePath),
        ],
      }),
      message.delete(),
    ]);
    return;
  }

  const imageExtension = matchIcon.imagePath.split(".").pop();

  // 첨부 이미지 이름을 한글로하면 임베드가 되지 않음.
  const imageAttachment = new AttachmentBuilder(matchIcon.imagePath, {
    name: `image.${imageExtension}`,
    description: matchIcon.keywords[0],
  });

  await Promise.all([
    message.channel.send({
      flags: MessageFlags.SuppressNotifications,
      embeds: [
        userProfileEmbed
          .setDescription(imageAttachment.description)
          .setImage(`attachment://${imageAttachment.name}`),
      ],
      files: [imageAttachment],
    }),
    message.delete(),
  ]);
}
