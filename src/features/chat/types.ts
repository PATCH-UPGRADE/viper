import { z } from "zod";
import type { AssetWithIssueRelations } from "@/features/assets/types";
import type { VulnerabilityWithRelations } from "@/features/vulnerabilities/types";
import type { Prisma } from "@/generated/prisma";
import type { UserRole } from "./utils";

export interface UseChatAgentConfig {
  agent?: "explainAsset" | "explainVulnerability" | "chat";
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
  limit: z.number(),
  cursorTimestamp: z.string().optional(),
  cursorId: z.string().optional(),
  offset: z.number().optional(),
});

export const chatThreadInclude = {
  _count: {
    select: { messages: true },
  },
} as const;

export type ChatThreadWithRelations = Prisma.ChatThreadGetPayload<{
  include: typeof chatThreadInclude;
}>;

export const fetchThreadsResponseSchema = z.object({
  threads: z.any().array(), // TODO
  hasMore: z.boolean(),
  total: z.number(),
});

export const fetchHistoryResponseSchema = z.any();
