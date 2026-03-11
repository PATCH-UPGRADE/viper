import { createTRPCRouter, protectedProcedure } from "@/trpc/init";
import { chatRequestSchema, realtimeRequestSchema } from "../types";
import { inngest } from "@/inngest/client";

import { getSubscriptionToken } from "@inngest/realtime";
import { createChannel } from "@/app/api/inngest/realtime";


export const chatRouter = createTRPCRouter({
  chat: protectedProcedure
    .input(chatRequestSchema)
    .query(async ({ ctx, input }) => {
      try {
        const { userMessage, threadId, channelKey } = input;

        await inngest.send({
          name: "agent/chat.requested",
          data: {
            userMessage,
            threadId,
            channelKey,
            userId: ctx.auth.user.id,
          },
        });
      } catch (error) {
        console.error(error);
        throw(error); // who cares
      }
    }),

  token: protectedProcedure
  .input(realtimeRequestSchema)
  .query(async ({ input }) => {
      const { channelKey } = input;
      const token = await getSubscriptionToken(inngest, {
      channel: createChannel(channelKey),
      topics: ["agent_stream"],
    });

    return token;
  }),
});
