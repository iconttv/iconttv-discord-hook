import AiRequestModel from '../database/model/AiRequestModel';
import logger from '../lib/logger';

export const saveAiRequestBuilder =
  (
    guildId: string,
    channelId: string,
    senderId: string | undefined,
    discordParams: object
  ) =>
  async (
    provider: string,
    modelName: string,
    aiParams: object,
    response: object
  ) => {
    await new AiRequestModel({
      guildId,
      channelId,
      senderId,
      provider,
      discordParams,
      modelName,
      aiParams,
      response,
    })
      .save()
      .catch(e => logger.error(e));
  };
