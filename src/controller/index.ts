import type { Client, Message } from "discord.js";
import { findMatchIconOrNull, getAbsoluteIconFilePath } from "../utils";

async function messageCreate(message: Message) {
  const { content, author } = message;
  const { displayName: sender } = author;
  const matchIcon = findMatchIconOrNull(content);
  if (!matchIcon) return;

  console.log(
    `Envoked icon command from "${message.author.displayName}" with command "${content}"`
  );
  const iconFilePath = getAbsoluteIconFilePath(matchIcon);
  await Promise.all([
    message.channel.send({
      content: `${sender}: `,
      files: [{ attachment: iconFilePath }],
    }),
    message.delete(),
  ]);
}

export function registerEvents(client: Client) {
  client.on("messageCreate", messageCreate);
}
