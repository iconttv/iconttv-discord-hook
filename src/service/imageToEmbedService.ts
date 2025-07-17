import {
  AttachmentBuilder,
  EmbedBuilder,
  Message,
  MessageFlags,
  TextChannel,
} from 'discord.js';
import logger, { channel_log_message } from '../lib/logger';
import sharp from 'sharp';
import {
  LogContext,
  base64ImageToAttachment,
  createUserProfileEmbed,
  deleteMessage,
  getLogContext,
} from '../utils/discord';

/**
 * icon으로 변환해야 할 이미지라면, sharp.Sharp 리턴,
 * 아니라면 null
 * @param url
 * @returns
 */
const getIconImageBuffer = async (url: string) => {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      logger.info(`Failed to fetch image. ${url} Status: ${response.status}`);
      return null;
    }
    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.startsWith('image/')) {
      logger.info(
        `URL does not point to an image. ${url} Content-Type: ${contentType}`
      );
      return null;
    }

    const buffer = await response.arrayBuffer();
    const imageSharp = sharp(buffer);
    const metadata = await imageSharp.metadata();

    const imageRatio = metadata.height / metadata.width;
    if (
      Math.abs(1 - imageRatio) < 0.1 &&
      metadata.width <= 201 &&
      metadata.height <= 201
    ) {
      // gif animated 일때 ratio 계산 이상한 경우 있음
      return sharp(buffer, { animated: true });
    }
    return null;
  } catch (error) {
    logger.error(`Failed to make sharp object ${error}`);
    return null;
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
    !isAttachmentImageOnly ||
    imageAttachments[0].spoiler
  ) {
    return;
  }
  const messageLogContext = getLogContext(message);
  if (!messageLogContext) {
    return;
  }

  const imageSharp = await getIconImageBuffer(imageAttachments[0].url);
  if (!imageSharp) {
    return;
  }
  const imageMetadata = await imageSharp.metadata();
  const imageBuffer = await imageSharp.toBuffer();
  const newImageAttachment = base64ImageToAttachment(
    imageBuffer.toString('base64'),
    {
      ext: imageMetadata.format,
    }
  );

  const embedMessage = createUserProfileEmbed(message, undefined, {
    description: message.content,
  }).setImage(`attachment://${newImageAttachment.name}`);

  await sendAndDeleteIconImageMessage(
    message,
    embedMessage,
    newImageAttachment,
    messageLogContext
  );
};

const sendAndDeleteIconImageMessage = async (
  message: Message,
  embed: EmbedBuilder,
  attachment: AttachmentBuilder,
  logContext: LogContext
) => {
  (message.channel as TextChannel)
    .send({
      flags: MessageFlags.SuppressNotifications,
      embeds: [embed],
      files: [attachment],
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
