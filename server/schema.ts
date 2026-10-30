import { z } from 'zod';

export const moods = ['warm', 'amused', 'thoughtful', 'gentle', 'curious', 'celebrating'] as const;
export const speechSchema = z.object({ text: z.string().trim().min(1).max(2000), mood: z.enum(moods).default('warm') }).strict();
export const replySchema = z.object({ text: z.string().trim().min(1).max(2000), mood: z.enum(moods) }).strict();
export const chatSchema = z.object({
  messages: z.array(z.object({ role: z.enum(['user', 'assistant']), text: z.string().trim().min(1).max(2000) }).strict()).max(30),
  preferences: z.object({ teasing: z.enum(['off', 'gentle']), faith: z.enum(['welcome', 'only-if-asked']) }).strict(),
  memories: z.array(z.string().trim().min(1).max(300)).max(10),
  mode: z.enum(['live', 'demo']),
  action: z.enum(['chat', 'topic']).optional(),
  topic: z.string().trim().max(100).optional(),
}).strict();
