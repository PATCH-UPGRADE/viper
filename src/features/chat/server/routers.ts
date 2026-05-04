import { getSubscriptionToken } from "@inngest/realtime";
import { createChannel } from "@/app/api/inngest/realtime";
import { inngest } from "@/inngest/client";
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
import prisma from "@/lib/db";
import z from "zod";
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
        summary: "Send Chat Message",
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
        summary: "Get Realtime Token",
        description:
          "Generate a subscription token for the Inngest realtime channel.",
      },
    })
    .output(tokenResponseSchema)
    .mutation(async ({ ctx }) => {
      const channelKey = ctx.auth.user.id;

      const result = await getSubscriptionToken(inngest, {
        channel: createChannel(channelKey),
        topics: ["agent_stream"],
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
        summary: "Fetch Threads",
        description: "fetch threads from backend",
      },
    })
    .output(fetchThreadsResponseSchema)
    .mutation(async ({ input, ctx }) => {
      const threads = await prisma.chatThread.findMany({
        skip: input.offset,
        take: input.limit,
        include: chatThreadInclude,
      });

      return {
        threads,
        hasMore: false,
        total: 0,
      };
    }),

  getHistory: protectedProcedure
    .input(z.object({ threadId: z.string() }))
    .meta({
      openapi: {
        method: "GET",
        path: "/chat/threads/{threadId}",
        tags: ["Chat"],
        summary: "Get conversation from thread",
        description: "get conversation from thread",
      },
    })
    .output(fetchHistoryResponseSchema)
    .mutation(async ({ input, ctx }) => {

      const prismaThread = await prisma.chatThread.findUniqueOrThrow({
        where: { id: input.threadId },
        include: chatThreadInclude,
      });

      const thread = {
        id: input.threadId,
        title: prismaThread.title,
        messageCount: prismaThread._count,
        createdAt: prismaThread.createdAt,
        updatedAt: prismaThread.updatedAt,
      };

      // This SHOULD work, but Inngest's docs are wrong (i.e, hallucinated)
      // TODO VW-XXX: switch away from Inngest's AgentKit framework

      /*const messages = await conversationHistoryAdapter.get!({
        threadId: input.threadId,
        state: {} as any,
        network: {} as any,
        input: "",
      });*/

     const prismaMessages = await prisma.chatMessage.findMany({
       where: {threadId: input.threadId}
     });

     // Instead, I had to do this. How did I find this? I went into Inngest's
     // source code and traced the `fetchHistory` call until I found the code
     // reponsible for formatting messages. No idea why it looks like that.
     // Anyways, if you use Inngest's actual exported types for messages it
     // won't work. You have to dig around and find their undocumented, untyped
     // json syntax.
     // TODO: VW-XXX switch away from Inngest's AgentKit framework
     // https://github.com/inngest/agent-kit/blob/6c9802fd79471bd77c0072a2978f45720dc1ca99/packages/use-agent/src/core/services/thread-manager.ts#L126
     const messages = prismaMessages.map((m) => ({
       message_id: m.id,
       createdAt: m.createdAt,
       content: m.content,
       role: m.role.toLowerCase(),
       type: m.role.toLowerCase(),
       data: {
         output: [{
           type: 'text',
           content: m.content,
         }]
       },
       status: 'sent',
     }))

      return {
        thread,
        messages,
      };
      // TODO: use conversation history adapter, copy the use-agent example from inngest source code...
      //return conversationHistoryAdapter
    }),
});
