import {
  type Client,
} from "discord.js";
import { onMessageCreate } from "./onMessageCreate";

export function registerEvents(client: Client) {
  client.on("messageCreate", onMessageCreate);
}
