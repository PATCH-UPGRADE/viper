import { z } from "zod";

export const chatRequestSchema = z.object({
  userMessage: z.object({
    id: z.string(),
    content: z.string(),
    role: z.literal("user"),
  }),
  threadId: z.string().optional(),
  channelKey: z.string(),
});

export const realtimeRequestSchema = z.object({
  userId: z.string().optional(),
  channelKey: z.string(),
});
