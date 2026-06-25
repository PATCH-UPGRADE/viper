import { z } from "zod";
import type { AssetWithIssueRelations } from "@/features/assets/types";
import type { VulnerabilityWithRelations } from "@/features/vulnerabilities/types";
import type { Prisma } from "@/generated/prisma";

export interface UseChatAgentConfig {
  agent?: "chat" | "giveRecommendations";
  assetData?: AssetWithIssueRelations;
  vulnerabilityData?: VulnerabilityWithRelations;
}

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
