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

  // Threads that have a report (the /reports list), newest-touched first. The
  // report row can be blank ("") — a thread started from /reports before the
  // agent has written anything still belongs in the list.
  getReportThreads: protectedProcedure
    .input(fetchThreadsSchema)
    .output(fetchThreadsResponseSchema)
    .query(async ({ input, ctx }) => {
      const threads = await prisma.chatThread.findMany({
        where: { userId: ctx.auth.user.id, reportId: { not: null } },
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
    .output(
      z.object({ report: z.string().nullable(), title: z.string().nullable() }),
    )
    .query(async ({ input, ctx }) => {
      const thread = await prisma.chatThread.findFirst({
        where: { id: input.threadId, userId: ctx.auth.user.id },
        select: { report: { select: { content: true, title: true } } },
      });
      return {
        report: thread?.report?.content ?? null,
        title: thread?.report?.title ?? null,
      };
    }),

  // Create an empty report thread up front (the "New" button in /reports) so it
  // shows in the sidebar before any message is sent. Takes the client-generated
  // id it's about to navigate to — always a fresh crypto.randomUUID(), so this
  // is never called twice for the same id.
  createReportThread: protectedProcedure
    .input(z.object({ threadId: z.string() }))
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ input, ctx }) => {
      await prisma.chatThread.create({
        data: {
          id: input.threadId,
          user: { connect: { id: ctx.auth.user.id } },
          report: { create: { content: "" } },
        },
      });
      return { success: true };
    }),

  // UIMessage-shaped history for the chat (AI SDK `useChat`). Rebuilds messages
  // from ChatMessage rows: text content + persisted tool UI parts. Tool entries
  // that aren't AI SDK-shaped are skipped (those rows render text-only).
  getUIMessages: protectedProcedure
    .input(z.object({ threadId: z.string() }))
    .query(async ({ input, ctx }) => {
      // A fresh /reports thread has no row yet — no history, not an error.
      const thread = await prisma.chatThread.findFirst({
        where: { id: input.threadId, userId: ctx.auth.user.id },
        select: { id: true },
      });
      if (!thread) return { messages: [] };
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
        select: { reportId: true },
      });
      if (!thread) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      // The FK sits on ChatThread, so the report row isn't cascaded — drop it
      // too. Independent deletes (nothing here for the other to race on), so
      // run them together. NOTE: this assumes 1:1 — once a ChatReport can be
      // shared by many threads (see the schema comment), this must check for
      // other referencing threads before deleting it.
      await Promise.all([
        prisma.chatThread.delete({ where: { id: input.threadId } }),
        thread.reportId
          ? prisma.chatReport.delete({ where: { id: thread.reportId } })
          : Promise.resolve(),
      ]);
      return { success: true };
    }),
});
