import { ResponseFormatJSONSchema } from 'openai/resources';
import { LogAiRequest, MessageFromDatabase } from '../../type';
import { LogContext } from '../discord';

export interface SummarizeMessagesProps {
  messages: MessageFromDatabase[];
  guildId: string;
  channelId: string;
  logRequest: LogAiRequest | undefined;
  context?: LogContext;
  skipSystemPrompt?: boolean;
}
export interface QuestionMessageProps {
  messages: MessageFromDatabase[];
  question: string;
  logRequest: LogAiRequest | undefined;
  context?: LogContext;
  skipSystemPrompt?: boolean;
}

/**
 * import { zodResponseFormat } from 'openai/src/helpers/zod';
 * throws when dynamic import
 */
export const SummarizeOutputSchemaOpenai: ResponseFormatJSONSchema.JSONSchema =
  {
    name: 'summarization',
    strict: true,
    schema: {
      type: 'object',
      properties: {
        topics: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              topic: {
                type: 'string',
                description: 'A topic from conversation',
                nullable: false,
              },
              startMessageId: {
                type: 'string',
                description: 'A start message id of the topic',
                nullable: false,
              },
            },
            additionalProperties: false,
            required: ['topic', 'startMessageId'],
          },
        },
        comment: {
          type: 'string',
          nullable: false,
        },
      },
      additionalProperties: false,
      required: ['topics', 'comment'],
    },
  };

export interface SummarizationOutput {
  topics: {
    topic: string;
    startMessageId: string;
  }[];
  comment: string;
}
