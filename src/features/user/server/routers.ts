import { headers } from "next/headers";
import z from "zod";
import { auth } from "@/lib/auth";
import prisma from "@/lib/db";
import {
  buildPaginationMeta,
  createPaginatedResponse,
  paginationInputSchema,
} from "@/lib/pagination";
import { createTRPCRouter, protectedProcedure } from "@/trpc/init";
import { requireOwnership } from "@/trpc/middleware";
import { apiTokenInputSchema } from "../types";

export const userRouter = createTRPCRouter({
  getManyApiTokens: protectedProcedure
    .input(paginationInputSchema)
    .query(async ({ ctx, input }) => {
      const { search } = input;

      const whereFilter = {
        userId: ctx.auth.user.id,
        name: {
          contains: search,
          mode: "insensitive" as const,
        },
      };

      // Get total count and build pagination metadata
      const totalCount = await prisma.apikey.count({
        where: whereFilter,
      });
      const meta = buildPaginationMeta(input, totalCount);

      // Fetch paginated items
      const items = await prisma.apikey.findMany({
        skip: meta.skip,
        take: meta.take,
        where: whereFilter,
        orderBy: { createdAt: "desc" },
      });

      return createPaginatedResponse(items, meta);
    }),

  createApiToken: protectedProcedure
    .input(apiTokenInputSchema)
    .mutation(async ({ ctx, input }) => {
      const data = await auth.api.createApiKey({
        body: {
          name: input.name,
          expiresIn: input.expiresIn,
          userId: ctx.auth.user.id,
          remaining: 100, // server-only
          refillAmount: 100, // server-only
          refillInterval: 1000, // server-only
          rateLimitTimeWindow: 1000, // server-only
          rateLimitMax: 100, // server-only
          rateLimitEnabled: true, // server-only
          //permissions, // server-only
        },
      });
      return data;
    }),

  removeApiToken: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // Verify ownership
      await requireOwnership(input.id, ctx.auth.user.id, "apikey");
      const data = await auth.api.deleteApiKey({
        body: {
          keyId: input.id,
        },
        headers: await headers(),
      });
      return data;
    }),
});
