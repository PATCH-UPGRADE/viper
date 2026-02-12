import z from "zod";
import prisma from "@/lib/db";
import { paginationInputSchema } from "@/lib/pagination";
import { fetchPaginated } from "@/lib/router-utils";
import { userIncludeSelect } from "@/lib/schemas";
import { createTRPCRouter, protectedProcedure } from "@/trpc/init";
import { requireOwnership } from "@/trpc/middleware";
import {
  paginatedWebhooksResponseSchema,
  updateWebhookSchema,
  webhookInputSchema,
  webhookResponseSchema,
} from "../types";

const webhooksInclude = {
  user: userIncludeSelect,
} as const;

export const webhooksRouter = createTRPCRouter({
  // GET /api/webhooks - List all webhooks of the user
  getMany: protectedProcedure
    .input(paginationInputSchema)
    .output(paginatedWebhooksResponseSchema)
    .query(async ({ ctx, input }) => {
      const { search } = input;

      const where = {
        name: {
          contains: search,
          mode: "insensitive" as const,
        },
        userId: ctx.auth.user.id,
      };

      return fetchPaginated(prisma.webhook, input, {
        where,
        include: webhooksInclude,
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
        include: webhooksInclude,
      });
    }),
  // PUT /api/webhooks - update an existing Webhook
  update: protectedProcedure
    .input(updateWebhookSchema)
    .output(webhookResponseSchema)
    .mutation(async ({ ctx, input }) => {
      const { id, ...updateData } = input;

      await requireOwnership(input.id, ctx.auth.user.id, "webhook");

      return prisma.webhook.update({
        where: { id },
        data: {
          ...updateData,
        },
        include: webhooksInclude,
      });
    }),
  // DELETE /api/webhooks - delete a Webhook
  remove: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.auth.user.id;
      await requireOwnership(input.id, userId, "webhook");

      return prisma.webhook.delete({
        where: {
          id: input.id,
          userId,
        },
      });
    }),
});
