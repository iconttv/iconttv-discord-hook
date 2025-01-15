import { SchemaType } from '@google/generative-ai';
import { z } from 'zod';

export const SummarizeOutputSchema = z.object({
  topics: z.array(
    z.object({
      topic: z.string(),
      startMessageId: z.string(),
    })
  ),
});

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

export type SummarizationOutput = z.infer<typeof SummarizeOutputSchema>;
