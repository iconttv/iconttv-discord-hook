import { AttachmentBuilder, type Client, type Message } from "discord.js";
import {
  createUserProfileEmbed,
  findMatchIconOrNull,
  getAbsoluteIconFilePath,
  getGuildMemberFromMessage,
} from "../utils";

async function messageCreate(message: Message) {
  const { content } = message;
  const guildMember = getGuildMemberFromMessage(message);
  const sender = guildMember?.nickname ?? "ㅇㅇ (223.38)";

  const matchIcon = findMatchIconOrNull(content);
  if (!matchIcon) return;

  console.log(
    `Envoked icon command from "${sender}" with command "${content}"`
  );

  const iconFilePath = getAbsoluteIconFilePath(matchIcon);
  const userProfileEmbed = createUserProfileEmbed(message);
  const imageExtension = iconFilePath.split(".").pop();
  const imageAttachment = new AttachmentBuilder(iconFilePath, {
    name: `image.${imageExtension}`,
    description: matchIcon.keywords[0],
  });

  await Promise.all([
    message.channel.send({
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

export function registerEvents(client: Client) {
  client.on("messageCreate", messageCreate);
}
