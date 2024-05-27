export type LogAiRequest = (
  provider: string,
  modelName: string,
  aiParams: object,
  response: object
) => Promise<void>;

export interface MessageFromDatabase {
  guildName?: string | null | undefined;
  channelName?: string | null | undefined;
  senderName?: string | null | undefined;
  message?: string | null | undefined;
  createdAt?: Date | null | undefined;
}
