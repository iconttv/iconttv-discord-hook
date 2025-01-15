export type LogAiRequest = (
  provider: string,
  modelName: string,
  aiParams: object,
  response: object
) => Promise<void>;

export interface MessageFromDatabase {
  guildId?: string | null;
  channelId?: string | null;
  messageId?: string | null;
  guildName?: string | null;
  channelName?: string | null;
  senderName?: string | null;
  message?: string | null;
  createdAt?: Date | null;
}
