import { z } from "zod";
import type { AssetWithIssueRelations } from "@/features/assets/types";
import type { VulnerabilityWithRelations } from "@/features/vulnerabilities/types";
import type { Prisma } from "@/generated/prisma";
import type { UserRole } from "./utils";

export interface UseChatAgentConfig {
  agent?:
    | "explainAsset"
    | "explainVulnerability"
    | "chat"
    | "giveRecommendations";
  assetData?: AssetWithIssueRelations;
  vulnerabilityData?: VulnerabilityWithRelations;
}

export interface NetworkState extends UseChatAgentConfig {
  userId?: string;
  userRole?: UserRole;
}

export const chatRequestSchema = z.object({
  userMessage: z.object({
    id: z.string(),
    content: z.string(),
    role: z.literal("user"),
    state: z.record(z.string(), z.unknown()).optional(),
  }),
  threadId: z.string().optional(),
  systemPrompt: z.string().optional(),
  history: z.array(z.unknown()).optional(),
  clientTimestamp: z.string().optional(),
});

export const chatResponseSchema = z.object({
  success: z.boolean(),
  threadId: z.string(),
});

export const realtimeRequestSchema = z.object({
  threadId: z.string().optional(),
});

export const tokenResponseSchema = z.object({
  key: z.string().optional(),
  // TODO: I know this is `any`, but channel gets converted a string in an API response, getSubscriptionToken just refuses to acknowledge that.
  // and if we don't leave this in typescript will throw  a fit :/
  channel: z.any(),
  topics: z.array(z.string()),
});

export const fetchThreadsSchema = z.object({
  userId: z.string().optional(),
  channelKey: z.string().optional(),
  limit: z.number().int().min(1).max(100),
  cursorTimestamp: z.string().optional(),
  cursorId: z.string().optional(),
  offset: z.number().int().min(0).optional(),
});

export const chatThreadInclude = {
  _count: {
    select: { messages: true },
  },
} as const;

export type ChatThreadWithRelations = Prisma.ChatThreadGetPayload<{
  include: typeof chatThreadInclude;
}>;

export const chatThreadSchema = z.object({
  id: z.string(),
  userId: z.string(),
  title: z.string().nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
  _count: z.object({
    messages: z.number(),
  }),
});

export const fetchThreadsResponseSchema = z.object({
  threads: z.array(chatThreadSchema),
  hasMore: z.boolean(),
  total: z.number(),
});

const chatHistoryMessageSchema = z.object({
  message_id: z.string(),
  createdAt: z.coerce.date(),
  content: z.string().nullable(),
  role: z.string(),
  type: z.string(),
  data: z.object({
    output: z.array(
      z.object({ type: z.string(), content: z.string().nullable() }),
    ),
  }),
  status: z.string(),
});

export const fetchedThreadSchema = z.object({
  id: z.string(),
  title: z.string().nullable(),
  messageCount: z.object({ messages: z.number() }),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export const fetchHistoryResponseSchema = z.object({
  thread: fetchedThreadSchema,
  messages: z.array(chatHistoryMessageSchema),
});
