import { z } from "zod";

export interface UseChatAgentConfig {
  assetId?: string;
  vulnerabilityId?: string;
}

export const fetchThreadsSchema = z.object({
  userId: z.string().optional(),
  channelKey: z.string().optional(),
  limit: z.number().int().min(1).max(100),
  cursorTimestamp: z.string().optional(),
  cursorId: z.string().optional(),
  offset: z.number().int().min(0).optional(),
});

// Scalar columns for the thread list — deliberately excludes the report's
// content, which the list never shows. reportId is included as a has-a-report
// signal (e.g. the thread selector's report indicator), not its content.
export const chatThreadListSelect = {
  id: true,
  userId: true,
  title: true,
  reportId: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { messages: true } },
} as const;

export const chatThreadSchema = z.object({
  id: z.string(),
  userId: z.string(),
  title: z.string().nullable(),
  reportId: z.string().nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
  _count: z.object({
    messages: z.number(),
  }),
});
export type ChatThread = z.infer<typeof chatThreadSchema>;

export const fetchThreadsResponseSchema = z.object({
  threads: z.array(chatThreadSchema),
  hasMore: z.boolean(),
  total: z.number(),
});
