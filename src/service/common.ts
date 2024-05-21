import OpenaiRequestModel from '../database/model/OpenaiRequestModel';
import logger from '../lib/logger';

export const saveOpenaiRequestBuilder =
  (
    guildId: string,
    channelId: string,
    senderId: string | undefined,
    discordParams: object
  ) =>
  async (openaiParams: object, response: object) => {
    await new OpenaiRequestModel({
      guildId,
      channelId,
      senderId,
      discordParams,
      openaiParams,
      response,
    })
      .save()
      .catch(e => logger.error(e));
  };
