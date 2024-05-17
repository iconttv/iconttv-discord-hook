import { Message } from "discord.js";
import Database from "../database";

const messageSaveService = async (message: Message) => {
  const database = Database.getInstance();

  message
}