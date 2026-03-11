import { z } from "zod";

export const chatRequestSchema = z.object({
  userMessage: z.object({
    id: z.string(),
    content: z.string(),
    role: z.literal("user"),
    state: z.record(z.string(), z.unknown()).optional(),
  }),
  threadId: z.string().optional(),
  channelKey: z.string().optional(),
  systemPrompt: z.string().optional(),
  history: z.array(z.unknown()).optional(),
  userId: z.string().optional(),
  clientTimestamp: z.string().optional(),
});

export const chatResponseSchema = z.object({
  success: z.boolean(),
  threadId: z.string(),
});

export const realtimeRequestSchema = z.object({
  userId: z.string().optional(),
  channelKey: z.string().optional(),
  threadId: z.string().optional(),
});

export const tokenResponseSchema = z.object({
  key: z.string().optional(),
  // TODO: I know this is `any`, but channel gets converted a string in an API response, getSubscriptionToken just refuses to acknowledge that.
  // and if we don't leave this in typescript will throw  a fit :/
  channel: z.any(),
  topics: z.array(z.string()),
});
