import { Attachment, Component, Embed, EmbedType } from 'discord.js';
import { databaseSqlite } from './failure_urls';
import { aiClient } from './client';
import logger from '../../lib/logger';
import { replaceDiscordEmoji } from './toolkit';
import { config } from '../../config';

interface ProcessedText {
  id: string;
  type: 'image' | 'text' | 'url' | EmbedType;
  text: string;
}

async function processAttachment(
  attachment: Attachment
): Promise<ProcessedText | null> {
  const contentType = attachment.contentType || '';
  const id = attachment.id || attachment.name || 'unknown';
  const url = attachment.url || attachment.proxyURL;

  if (databaseSqlite.isFailedUrl(url)) {
    return null;
  }

  try {
    const text: string[] = [];
    if (attachment.contentType) {
      text.push(`### CONTENT_TYPE\n${attachment.contentType}`);
    }
    if (attachment.name) {
      text.push(`### NAME\n${attachment.name}`);
    }
    if (attachment.title) {
      text.push(`### TITLE\n${attachment.title}`);
    }
    if (attachment.description) {
      text.push(`### DESCRIPTION\n${attachment.description}`);
    }

    if (contentType.startsWith('image/')) {
      const caption = await aiClient.imageToText(url);
      text.push(`### FILE\n${caption}`);

      return { id, type: 'image', text: text.join('\n\n') };
    } else if (contentType.startsWith('text/')) {
      const content = await aiClient.textFileToText(url);
      text.push(`### FILE\n${content}`);

      return { id, type: 'text', text: text.join('\n\n') };
    } else {
      logger.info(`Skipping attachment with contentType: ${contentType}`);
      return null;
    }
  } catch (error) {
    logger.error(`Error processing attachment ${attachment.id} ${url}:`, error);
    databaseSqlite.insertFailedUrl(url);
    return null;
  }
}

async function processComponent(
  component: Component
): Promise<ProcessedText | null> {
  logger.info(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    `Skipping components processing for message ${(component as any)?.id}`
  );
  return null;
}

async function processEmbed(embed: Embed): Promise<ProcessedText | null> {
  if (!embed) {
    return null;
  }
  const id =
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (embed as any).id || (embed.data as any)?.id || Date.now().toString();

  try {
    const text: string[] = [];

    if (embed.data.provider?.name) {
      text.push(`### PROVIDER\n${embed.data.provider?.name}`);
    }
    if (embed.data.title) {
      text.push(`### TITLE\n${embed.data.title}`);
    }
    if (embed.data.author?.name) {
      text.push(`### AUTHOR\n${embed.data.author?.name}`);
    }
    if (embed.data.description) {
      text.push(`### DESCRIPTION\n${embed.data.description}`);
    }

    // causes too many input tokens
    // // Process URL if available
    // if (embed.data?.url && !databaseSqlite.isFailedUrl(embed.data.url)) {
    // 	try {
    // 		const urlText = await aiClient.urlToText(embed.data.url);
    // 		texts.push(urlText);
    // 	} catch (error) {
    // 		console.error(`Error processing embed URL ${embed.data.url}:`, error);
    // 		databaseSqlite.insertFailedUrl(embed.data.url);
    // 	}
    // }

    // Process thumbnail if available
    if (
      embed.data?.thumbnail?.url &&
      !databaseSqlite.isFailedUrl(embed.data?.thumbnail?.url)
    ) {
      try {
        const thumbnailText = await aiClient.imageToText(
          embed.data.thumbnail.url
        );
        text.push(`### THUMBNAIL\n${thumbnailText}`);
      } catch (error) {
        logger.error(
          `Error processing embed thumbnail ${embed.data.thumbnail.url}:`,
          error
        );
        databaseSqlite.insertFailedUrl(embed.data.thumbnail.url);
      }
    }
    if (text.length === 0) {
      return null;
    }

    return { id, type: embed.data.type || 'url', text: text.join('\n\n') };
  } catch (error) {
    logger.error(`Error processing embed ${id}:`, error);
    return null;
  }
}

interface ProcessMessageDocument {
  guildId: string;
  channelId: string;
  messageId: string;
  messageType?: number;
  message: string;
  attachments?: unknown[];
  components?: Component[];
  embeds?: Embed[];
  senderId: string;
  guildName: string;
  channelName: string;
  senderName: string;
  raw: string;
  createdAt: Date;
}

interface MessageForEmbedding {
  TEXT_MESSAGE?: string;
  TEXT_ATTACHMENTS?: Map<string, string>;
  TEXT_COMPONENTS?: Map<string, string>;
  TEXT_EMBEDS?: Map<string, string>;
}

interface ProcessMessageUpdateData extends MessageForEmbedding {
  EMBEDDING_INPUT?: string;
  EMBEDDING_STATUS?: boolean;
  EMBEDDING?: number[];
  EMBEDDING_MODEL?: string;
  EMBEDDING_DIM?: number;
}

export async function processMessage(
  msgDoc: ProcessMessageDocument
): Promise<ProcessMessageUpdateData | null> {
  const guildId = msgDoc.guildId;
  const channelId = msgDoc.channelId;
  const messageId = msgDoc.messageId;

  if (!guildId || !channelId || !messageId) {
    logger.info(
      `Skipping message with missing required fields: guildId=${guildId}, channelId=${channelId}, messageId=${messageId}`
    );
    // // Update the document
    // await MessageModel.updateOne(
    // 	{ guildId, channelId, messageId },
    // 	{
    // 		$set: {
    // 			EMBEDDING_STATUS: false,
    // 		},
    // 	},
    // );
    return null;
  }

  const updateData: ProcessMessageUpdateData = {};

  try {
    let hasUpdates = false;

    // Process TEXT_MESSAGE
    if (msgDoc.message) {
      try {
        updateData.TEXT_MESSAGE = replaceDiscordEmoji(msgDoc.message);
        hasUpdates = true;
      } catch (error) {
        logger.error(`Error processing message text for ${messageId}:`, error);
      }
    }

    // Process TEXT_ATTACHMENTS
    if (msgDoc.attachments && msgDoc.attachments.length > 0) {
      try {
        const processedAttachments: ProcessedText[] = [];
        for (const attachment of msgDoc.attachments) {
          const processed = await processAttachment(attachment as Attachment);
          if (processed) {
            processedAttachments.push(processed);
          }
        }
        if (processedAttachments.length > 0) {
          updateData.TEXT_ATTACHMENTS = new Map(
            processedAttachments.map(att => [
              att.id,
              `## ${att.type.toUpperCase()}\n${att.text}`,
            ])
          );
          hasUpdates = true;
        }
      } catch (error) {
        logger.error(`Error processing attachments for ${messageId}:`, error);
      }
    }

    // Skip TEXT_COMPONENTS (just log)
    if (msgDoc.components && msgDoc.components.length > 0) {
      try {
        const processedComponents: ProcessedText[] = [];
        for (const component of msgDoc.components) {
          const processed = await processComponent(component as Component);
          if (processed) {
            processedComponents.push(processed);
          }
        }
        if (processedComponents.length > 0) {
          updateData.TEXT_COMPONENTS = new Map(
            processedComponents.map(comp => [
              comp.id,
              `## ${comp.type.toUpperCase()}\n${comp.text}`,
            ])
          );
          hasUpdates = true;
        }
      } catch (error) {
        logger.error(`Error processing attachments for ${messageId}:`, error);
      }
    }

    // Process TEXT_EMBEDS
    if (msgDoc.embeds && msgDoc.embeds.length > 0) {
      try {
        const processedEmbeds: ProcessedText[] = [];
        for (const embed of msgDoc.embeds) {
          const processed = await processEmbed(embed as Embed);
          if (processed) {
            processedEmbeds.push(processed);
          }
        }
        if (processedEmbeds.length > 0) {
          updateData.TEXT_EMBEDS = new Map(
            processedEmbeds.map(embed => [
              embed.id,
              `## ${embed.type.toUpperCase()}\n${embed.text}`,
            ])
          );
          hasUpdates = true;
        }
      } catch (error) {
        logger.error(`Error processing embeds for ${messageId}:`, error);
      }
    }

    // If we have text updates, create combined text and embedding
    if (hasUpdates) {
      try {
        const embeddingResult = await calculateEmbedding({
          TEXT_MESSAGE: updateData.TEXT_MESSAGE,
          TEXT_ATTACHMENTS: updateData.TEXT_ATTACHMENTS,
          TEXT_COMPONENTS: updateData.TEXT_COMPONENTS,
          TEXT_EMBEDS: updateData.TEXT_EMBEDS,
        });

        if (embeddingResult) {
          updateData.TEXT_MESSAGE = embeddingResult.TEXT_MESSAGE;
          updateData.EMBEDDING_INPUT = embeddingResult.EMBEDDING_INPUT;
          updateData.EMBEDDING_STATUS = embeddingResult.EMBEDDING_STATUS;
          updateData.EMBEDDING = embeddingResult.EMBEDDING;
          updateData.EMBEDDING_MODEL = embeddingResult.EMBEDDING_MODEL;
          updateData.EMBEDDING_DIM = embeddingResult.EMBEDDING_DIM;
        } else {
          updateData.EMBEDDING_STATUS = false;
        }
      } catch (error) {
        logger.error(`Error creating embedding for ${messageId}:`, error);

        // Continue without embedding
        // ignore embedding server fail
        updateData.EMBEDDING_STATUS = false;
      }
    }
  } catch (error) {
    logger.error(`Error processing message ${messageId}:`, error);
  }

  return updateData;
}

export async function calculateEmbedding(
  messageText: MessageForEmbedding
): Promise<ProcessMessageUpdateData | null> {
  const combinedTexts: string[] = [];

  const pureMessage = messageText.TEXT_MESSAGE
    ? replaceDiscordEmoji(messageText.TEXT_MESSAGE)
    : undefined;
  if (pureMessage) {
    combinedTexts.push(`# TEXT\n${pureMessage}`);
  }

  if (messageText.TEXT_ATTACHMENTS) {
    for (const text of messageText.TEXT_ATTACHMENTS.values()) {
      combinedTexts.push(`# ATTACHMENT\n${text}`);
    }
  }
  if (messageText.TEXT_COMPONENTS) {
    for (const text of messageText.TEXT_COMPONENTS.values()) {
      combinedTexts.push(`# COMPONENT\n${text}`);
    }
  }

  if (messageText.TEXT_EMBEDS) {
    for (const text of messageText.TEXT_EMBEDS.values()) {
      combinedTexts.push(`# EMBED\n${text}`);
    }
  }

  if (combinedTexts.length === 0) {
    return null;
  }

  const embeddingResult: ProcessMessageUpdateData = {
    ...messageText,
    TEXT_MESSAGE: pureMessage,
  };

  const combinedText = combinedTexts.join('\n\n\n');
  embeddingResult.EMBEDDING_INPUT = combinedText;

  const embedding = await aiClient.createEmbeddingText(combinedText);
  embeddingResult.EMBEDDING_STATUS = true;
  embeddingResult.EMBEDDING = embedding;
  embeddingResult.EMBEDDING_MODEL = config.EMBEDDING_OPENAI_MODEL;
  embeddingResult.EMBEDDING_DIM = embedding.length;

  return embeddingResult;
}
