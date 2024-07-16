import AiRequestModel from '../database/model/AiRequestModel.js';
import logger from '../lib/logger.js';

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
