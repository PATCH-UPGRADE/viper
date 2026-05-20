import { getSubscriptionToken } from "@inngest/realtime";
import { TRPCError } from "@trpc/server";
import z from "zod";
import { createChannel } from "@/app/api/inngest/realtime";
import { inngest } from "@/inngest/client";
import prisma from "@/lib/db";
import { createTRPCRouter, protectedProcedure } from "@/trpc/init";
import {
  chatRequestSchema,
  chatResponseSchema,
  chatThreadInclude,
  fetchHistoryResponseSchema,
  fetchThreadsResponseSchema,
  fetchThreadsSchema,
  realtimeRequestSchema,
  tokenResponseSchema,
} from "../types";
import { conversationHistoryAdapter } from "../viper-agent/history-adapter";

// https://agentkit.inngest.com/streaming/transport#sendmessageparams-options
export const chatRouter = createTRPCRouter({
  chat: protectedProcedure
    .input(chatRequestSchema)
    .meta({
      openapi: {
        method: "POST",
        path: "/chat",
        tags: ["Chat"],
        summary: "[Internal] Send Chat Message",
        description:
          "Send a user message to the AI chat agent via Inngest realtime.",
      },
    })
    .output(chatResponseSchema)
    .mutation(async ({ ctx, input }) => {
      const { userMessage, threadId, systemPrompt, history } = input;

      const resolvedThreadId = threadId ?? crypto.randomUUID();
      const channelKey = ctx.auth.user.id;

      await inngest.send({
        name: "agent/chat.requested",
        data: {
          userMessage,
          threadId: resolvedThreadId,
          channelKey,
          userId: ctx.auth.user.id,
          systemPrompt,
          history,
        },
      });

      return { success: true, threadId: resolvedThreadId };
    }),

  token: protectedProcedure
    .input(realtimeRequestSchema)
    .meta({
      openapi: {
        method: "POST",
        path: "/realtime/token",
        tags: ["Chat"],
        summary: "[Internal] Get Realtime Token",
        description:
          "Generate a subscription token for the Inngest realtime channel.",
      },
    })
    .output(tokenResponseSchema)
    .mutation(async ({ ctx }) => {
      const channelKey = ctx.auth.user.id;

      const result = await getSubscriptionToken(inngest, {
        channel: createChannel(channelKey),
        topics: ["agent_stream", "thread_updated"],
      });

      return result;
    }),

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

  getHistory: protectedProcedure
    .input(z.object({ threadId: z.string() }))
    .meta({
      openapi: {
        method: "GET",
        path: "/chat/threads/{threadId}",
        tags: ["Chat"],
        summary: "[Internal] Get conversation from thread",
      },
    })
    .output(fetchHistoryResponseSchema)
    .query(async ({ input, ctx }) => {
      const prismaThread = await prisma.chatThread.findUniqueOrThrow({
        where: { id: input.threadId, userId: ctx.auth.user.id },
        include: chatThreadInclude,
      });

      const thread = {
        id: input.threadId,
        title: prismaThread.title,
        messageCount: prismaThread._count,
        createdAt: prismaThread.createdAt,
        updatedAt: prismaThread.updatedAt,
      };

      // conversationHistoryAdapter.get() only uses threadId from its context arg;
      // state/network/input are required by the HistoryConfig type but ignored.
      // biome-ignore lint/suspicious/noExplicitAny: dummy context satisfies HistoryConfig type
      const historyCtx = { threadId: input.threadId } as any;
      const agentResults = await conversationHistoryAdapter.get!(historyCtx);

      const messages = agentResults.map((result, index) => ({
        id:
          result.id ??
          `${result.agentName}:${result.createdAt.toISOString()}:${index}`,
        agentName: result.agentName,
        createdAt: result.createdAt,
        output: result.output,
      }));

      return { thread, messages };
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
