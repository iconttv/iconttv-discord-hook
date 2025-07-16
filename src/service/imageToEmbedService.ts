import { EmbedBuilder, Message, MessageFlags, TextChannel } from 'discord.js';
import logger, { channel_log_message } from '../lib/logger';
import sharp from 'sharp';
import {
  LogContext,
  createUserProfileEmbed,
  deleteMessage,
  getLogContext,
} from '../utils/discord';

/**
 * 200px x 200px 이하의 정사각형 이미지
 * @param url
 * @returns
 */
const isIconImage = async (url: string) => {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      logger.info(`Failed to fetch image. ${url} Status: ${response.status}`);
      return false;
    }
    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.startsWith('image/')) {
      logger.info(
        `URL does not point to an image. ${url} Content-Type: ${contentType}`
      );
      return false;
    }

    const buffer = await response.arrayBuffer();
    const metadata = await sharp(buffer).metadata();

    return (
      metadata.width === metadata.height &&
      metadata.width <= 201 &&
      metadata.height <= 201
    );
  } catch (error) {
    logger.error(`Failed to make sharp object ${error}`);
    return false;
  }
};

export const replaceImageToEmbed = async (message: Message) => {
  const attachmentArray = Array.from(message.attachments.values());

  const imageAttachments = attachmentArray.filter(attachment =>
    attachment.contentType?.startsWith('image/')
  );

  const isAttachmentImageOnly =
    attachmentArray.length === imageAttachments.length;

  const hasComponents = message.components.length > 0;
  const hasStickers = message.stickers.size > 0;
  const hasEmbeds = message.embeds.length > 0;

  if (
    hasComponents ||
    hasStickers ||
    hasEmbeds ||
    imageAttachments.length !== 1 ||
    !isAttachmentImageOnly
  ) {
    return;
  }
  const messageLogContext = getLogContext(message);
  if (!messageLogContext) {
    return;
  }

  if (!(await isIconImage(imageAttachments[0].url))) {
    return;
  }

  const embedMessage = createUserProfileEmbed(message, undefined, {
    image: {
      url: imageAttachments[0].url,
      height: 100,
      width: 100,
    },
    description: message.content,
  });

  await sendAndDeleteIconImageMessage(message, embedMessage, messageLogContext);
};

const sendAndDeleteIconImageMessage = async (
  message: Message,
  embed: EmbedBuilder,
  logContext: LogContext
) => {
  (message.channel as TextChannel)
    .send({
      flags: MessageFlags.SuppressNotifications,
      embeds: [embed],
    })
    .then(() => {
      deleteMessage(message)
        .then(() => {
          logger.debug(
            channel_log_message('Message Deleted Successfully', logContext)
          );
        })
        .catch(e => {
          logger.error(
            channel_log_message(`Message Deletion Failed. ${e}`, logContext)
          );
        });

      logger.debug(
        channel_log_message(
          'Icon image changed to embed Successfully',
          logContext!
        )
      );
    })
    .catch(error => {
      logger.error(
        channel_log_message(
          `Icon image changed to embed Failed: ${error}`,
          logContext
        )
      );
    });
};
