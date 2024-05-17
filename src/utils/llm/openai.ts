import OpenAI from 'openai';
import { config } from '../../config';
import { messageSchema } from '../../database/model/MessageModel';

const openai = new OpenAI({
  apiKey: config.OPENAI_SECRET,
});

const summarizeMessages = async (messages: messageSchema) => {};
