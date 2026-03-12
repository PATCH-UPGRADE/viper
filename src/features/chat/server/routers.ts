import { getSubscriptionToken } from "@inngest/realtime";
import { createChannel } from "@/app/api/inngest/realtime";
import { inngest } from "@/inngest/client";
import { createTRPCRouter, protectedProcedure } from "@/trpc/init";
import {
  chatRequestSchema,
  chatResponseSchema,
  realtimeRequestSchema,
  tokenResponseSchema,
} from "../types";

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
});
