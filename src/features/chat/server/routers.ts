import { TRPCError } from "@trpc/server";
import z from "zod";
import prisma from "@/lib/db";
import { createTRPCRouter, protectedProcedure } from "@/trpc/init";
import {
  chatThreadInclude,
  fetchThreadsResponseSchema,
  fetchThreadsSchema,
} from "../types";

export const chatRouter = createTRPCRouter({
  getManyThreads: protectedProcedure
    .input(fetchThreadsSchema)
    .meta({
      openapi: {
        method: "GET",
        path: "/chat/threads",
        tags: ["Chat"],
        summary: "[Internal] Fetch Threads",
      },
    })
    .output(fetchThreadsResponseSchema)
    .query(async ({ input, ctx }) => {
      // get only a user's threads
      const threads = await prisma.chatThread.findMany({
        where: { userId: ctx.auth.user.id },
        skip: input.offset,
        take: input.limit,
        include: chatThreadInclude,
        orderBy: { createdAt: "desc" },
      });

      // TODO: paginate threads
      return {
        threads,
        hasMore: false,
        total: threads.length,
      };
    }),

  // UIMessage-shaped history for the LangGraph chat (AI SDK `useChat`).
  // Rebuilds messages from ChatMessage rows: text content + persisted tool
  // UI parts. Old AgentKit-format toolCalls are skipped (render text-only).
  getUIMessages: protectedProcedure
    .input(z.object({ threadId: z.string() }))
    .query(async ({ input, ctx }) => {
      await prisma.chatThread.findUniqueOrThrow({
        where: { id: input.threadId, userId: ctx.auth.user.id },
      });
      const rows = await prisma.chatMessage.findMany({
        where: { threadId: input.threadId },
        orderBy: { createdAt: "asc" },
      });
      const messages = rows.map((r) => {
        const parts: unknown[] = [];
        if (r.content?.trim()) parts.push({ type: "text", text: r.content });
        if (Array.isArray(r.toolCalls)) {
          for (const tc of r.toolCalls as { type?: string }[]) {
            if (
              tc &&
              typeof tc === "object" &&
              typeof tc.type === "string" &&
              (tc.type === "dynamic-tool" || tc.type.startsWith("tool-"))
            ) {
              parts.push(tc);
            }
          }
        }
        return {
          id: r.id,
          role: r.role === "USER" ? ("user" as const) : ("assistant" as const),
          parts,
        };
      });
      return { messages };
    }),

  deleteThread: protectedProcedure
    .input(z.object({ threadId: z.string() }))
    .meta({
      openapi: {
        method: "DELETE",
        path: "/chat/threads/{threadId}",
        tags: ["Chat"],
        summary: "[Internal] Delete a conversation thread",
      },
    })
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ input, ctx }) => {
      const thread = await prisma.chatThread.findFirst({
        where: { id: input.threadId, userId: ctx.auth.user.id },
      });
      if (!thread) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      await prisma.chatThread.delete({ where: { id: input.threadId } });
      return { success: true };
    }),
});
