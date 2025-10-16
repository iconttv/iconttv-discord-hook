import { Attachment, Component, Embed, EmbedType } from 'discord.js';
import { databaseSqlite } from './failure_urls';
import { aiClient } from './client';
import logger from '../../lib/logger';
import { replaceDiscordImage } from './toolkit';
import { config } from '../../config';
import MessageModel from '../../database/model/MessageModel';

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

interface ProcessMessageUpdateData {
  TEXT_MESSAGE?: string;
  TEXT_ATTACHMENTS?: Map<string, string>;
  TEXT_COMPONENTS?: Map<string, string>;
  TEXT_EMBEDS?: Map<string, string>;
  EMBEDDING_INPUT?: string;
  EMBEDDING_STATUS?: boolean;
  EMBEDDING?: number[];
  EMBEDDING_MODEL?: string;
  EMBEDDING_DIM?: number;
}

export async function processMessage(msgDoc: ProcessMessageDocument): Promise<
  | {
      EMBEDDING_STATUS: true;
      EMBEDDING_INPUT: string;
      EMBEDDING: number[];
      EMBEDDING_MODEL: string;
      EMBEDDING_DIM: number;
    }
  | {
      EMBEDDING_STATUS: false;
    }
  | null
> {
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

  try {
    const updateData: ProcessMessageUpdateData = {};
    let hasUpdates = false;

    // Process TEXT_MESSAGE
    if (msgDoc.message) {
      try {
        updateData.TEXT_MESSAGE = replaceDiscordImage(msgDoc.message);
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
      const combinedTexts: string[] = [];

      if (updateData.TEXT_MESSAGE) {
        combinedTexts.push(`# TEXT\n${updateData.TEXT_MESSAGE}`);
      }

      if (updateData.TEXT_ATTACHMENTS) {
        for (const text of updateData.TEXT_ATTACHMENTS.values()) {
          combinedTexts.push(`# ATTACHMENT\n${text}`);
        }
      }
      if (updateData.TEXT_COMPONENTS) {
        for (const text of updateData.TEXT_COMPONENTS.values()) {
          combinedTexts.push(`# COMPONENT\n${text}`);
        }
      }

      if (updateData.TEXT_EMBEDS) {
        for (const text of updateData.TEXT_EMBEDS.values()) {
          combinedTexts.push(`# EMBED\n${text}`);
        }
      }

      if (combinedTexts.length > 0) {
        const combinedText = combinedTexts.join('\n\n\n');
        updateData.EMBEDDING_INPUT = combinedText;

        try {
          const embedding = await aiClient.createEmbeddingText(combinedText);
          updateData.EMBEDDING_STATUS = true;
          updateData.EMBEDDING = embedding;
          updateData.EMBEDDING_MODEL = config.EMBEDDING_OPENAI_MODEL;
          updateData.EMBEDDING_DIM = embedding.length;
        } catch (error) {
          logger.error(
            `Error creating embedding for ${messageId} ${combinedText}:`,
            error
          );
          // Continue without embedding
          // ignore embedding server fail
          // updateData.EMBEDDING_STATUS = false;
        }
      }

      // Update the document
      await MessageModel.updateOne(
        { guildId, channelId, messageId },
        { $set: updateData }
      );
      logger.info(
        `Updated message ${messageId} with ${
          Object.keys(updateData).length
        } fields`
      );
      return {
        EMBEDDING_INPUT: updateData.EMBEDDING_INPUT!,
        EMBEDDING_STATUS: true,
        EMBEDDING: updateData.EMBEDDING!,
        EMBEDDING_MODEL: updateData.EMBEDDING_MODEL!,
        EMBEDDING_DIM: updateData.EMBEDDING_DIM!,
      };
    }

    return {
      EMBEDDING_STATUS: false,
    };
  } catch (error) {
    logger.error(`Error processing message ${messageId}:`, error);
    return {
      EMBEDDING_STATUS: false,
    };
  }
}
