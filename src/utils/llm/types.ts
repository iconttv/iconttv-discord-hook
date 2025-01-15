import { SchemaType } from '@google/generative-ai';
import { ResponseFormatJSONSchema } from 'openai/resources';

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
      },
      additionalProperties: false,
      required: ['topics'],
    },
  };

export const SummarizeOutputSchemaGemini = {
  type: SchemaType.ARRAY,
  items: {
    type: SchemaType.OBJECT,
    properties: {
      topic: {
        type: SchemaType.STRING,
        description: 'A topic from conversation',
        nullable: false,
      },
      startMessageId: {
        type: SchemaType.STRING,
        description: 'A start message id of the topic',
        nullable: false,
      },
    },
    required: ['topic', 'startMessageId'],
  },
};

export interface SummarizationOutput {
  topics: {
    topic: string;
    startMessageId: string;
  }[];
}
