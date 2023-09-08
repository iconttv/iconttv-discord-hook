import {
  AttachmentBuilder,
  type Client,
  type Message,
  MessageFlags,
} from "discord.js";
import {
  createUserProfileEmbed,
  findMatchIconOrNull,
  getAbsoluteIconFilePath,
  getGuildMemberFromMessage,
} from "../utils/discord";

async function messageCreate(message: Message) {
  const { content } = message;
  const guildMember = getGuildMemberFromMessage(message);
  const sender =
    guildMember?.nickname ??
    guildMember?.displayName ??
    guildMember?.user.displayName ??
    guildMember?.user.globalName ??
    guildMember?.user.username;

  const matchResult = findMatchIconOrNull(content);
  if (!matchResult) return;
  const [matchIcon, isAnonMessage] = matchResult;

  console.log(
    `Envoked icon command from "${sender}" with command "${content}"`
  );

  const iconFilePath = getAbsoluteIconFilePath(matchIcon);
  const userProfileEmbed = createUserProfileEmbed(message, {
    asAnonUser: isAnonMessage,
  });
  const imageExtension = iconFilePath.split(".").pop();

  // 첨부 이미지 이름을 한글로하면 임베드가 되지 않음.
  const imageAttachment = new AttachmentBuilder(iconFilePath, {
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

export function registerEvents(client: Client) {
  client.on("messageCreate", messageCreate);
}
