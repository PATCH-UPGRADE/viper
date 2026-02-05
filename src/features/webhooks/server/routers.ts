import z from "zod";
import prisma from "@/lib/db";
import { paginationInputSchema } from "@/lib/pagination";
import { fetchPaginated } from "@/lib/router-utils";
import { createTRPCRouter, protectedProcedure } from "@/trpc/init";
import {
  paginatedWebhooksResponseSchema,
  updateWebhookSchema,
  webhookInputSchema,
  webhookResponseSchema,
} from "../types";

export const webhooksRouter = createTRPCRouter({
  // GET /api/webhooks - List all webhooks of the user
  getMany: protectedProcedure
    .input(paginationInputSchema)
    .output(paginatedWebhooksResponseSchema)
    .query(async ({ ctx, input }) => {
      return fetchPaginated(prisma.webhook, input, {
        where: { userId: ctx.auth.user.id },
      });
    }),
  // POST /api/webhooks - Create a new Webhook
  create: protectedProcedure
    .input(webhookInputSchema)
    .output(webhookResponseSchema)
    .mutation(async ({ ctx, input }) => {
      return prisma.webhook.create({
        data: {
          ...input,
          userId: ctx.auth.user.id,
        },
        include: { user: true },
      });
    }),
  // PUT /api/webhooks - update an existing Webhook
  update: protectedProcedure
    .input(updateWebhookSchema)
    .output(webhookResponseSchema)
    .mutation(async ({ input }) => {
      const { id, ...updateData } = input;
      return prisma.webhook.update({
        where: { id },
        data: {
          ...updateData,
        },
        include: { user: true },
      });
    }),
  // DELETE /api/webhooks - delete a Webhook
  remove: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return prisma.webhook.delete({
        where: {
          id: input.id,
          userId: ctx.auth.user.id,
        },
      });
    }),
});
