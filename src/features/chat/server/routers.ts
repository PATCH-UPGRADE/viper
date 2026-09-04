import { TRPCError } from "@trpc/server";
import z from "zod";
import prisma from "@/lib/db";
import { createTRPCRouter, protectedProcedure } from "@/trpc/init";
import {
  chatThreadListSelect,
  fetchThreadsResponseSchema,
  fetchThreadsSchema,
} from "../types";

export const chatRouter = createTRPCRouter({
  // A user's chat threads, newest-created first. No pagination yet.
  getManyThreads: protectedProcedure
    .input(fetchThreadsSchema)
    .output(fetchThreadsResponseSchema)
    .query(async ({ input, ctx }) => {
      const threads = await prisma.chatThread.findMany({
        where: { userId: ctx.auth.user.id },
        skip: input.offset,
        take: input.limit,
        select: chatThreadListSelect,
        orderBy: { createdAt: "desc" },
      });

      // TODO: paginate threads
      return { threads, hasMore: false, total: threads.length };
    }),

  // Threads that have a report (the /reports list), newest-touched first.
  getReportThreads: protectedProcedure
    .input(fetchThreadsSchema)
    .output(fetchThreadsResponseSchema)
    .query(async ({ input, ctx }) => {
      const threads = await prisma.chatThread.findMany({
        where: { userId: ctx.auth.user.id, report: { not: null } },
        skip: input.offset,
        take: input.limit,
        select: chatThreadListSelect,
        orderBy: { updatedAt: "desc" },
      });

      // TODO: paginate threads
      return { threads, hasMore: false, total: threads.length };
    }),

  // The report Markdown for the /reports detail panel. Not scoped to
  // report != null: a freshly-started /reports conversation has no report yet
  // and the page still needs to render. `null` for an unknown or report-less thread.
  getReportThread: protectedProcedure
    .input(z.object({ threadId: z.string() }))
    .output(z.object({ report: z.string().nullable() }))
    .query(async ({ input, ctx }) => {
      const thread = await prisma.chatThread.findFirst({
        where: { id: input.threadId, userId: ctx.auth.user.id },
        select: { report: true },
      });
      return { report: thread?.report ?? null };
    }),

  // UIMessage-shaped history for the chat (AI SDK `useChat`). Rebuilds messages
  // from ChatMessage rows: text content + persisted tool UI parts. Tool entries
  // that aren't AI SDK-shaped are skipped (those rows render text-only).
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
