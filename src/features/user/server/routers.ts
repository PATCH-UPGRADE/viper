import { headers } from "next/headers";
import { z } from "zod";
import { auth } from "@/lib/auth";
import prisma from "@/lib/db";
import {
  buildPaginationMeta,
  createPaginatedResponse,
  paginationInputSchema,
} from "@/lib/pagination";
import { createTRPCRouter, protectedProcedure } from "@/trpc/init";
import { apiTokenInputSchema } from "../types";

export const userRouter = createTRPCRouter({
  listAssignable: protectedProcedure.query(async () => {
    return prisma.user.findMany({
      select: { id: true, name: true, email: true, image: true },
      orderBy: { name: "asc" },
    });
  }),

  getManyApiTokens: protectedProcedure
    .input(paginationInputSchema)
    .query(async ({ ctx, input }) => {
      const { search } = input;

      const whereFilter = {
        referenceId: ctx.auth.user.id,
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
      const userId = ctx.auth.user.id;
      const { name } = input;

      const data = await auth.api.createApiKey({
        body: {
          name,
          expiresIn: input.expiresIn,
          userId,
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
      // Scope to the owner (referenceId) so a user can only delete their own
      // key; throws if it's missing or not theirs.
      await prisma.apikey.findFirstOrThrow({
        where: { id: input.id, referenceId: ctx.auth.user.id },
        select: { id: true },
      });

      const data = await auth.api.deleteApiKey({
        body: {
          keyId: input.id,
        },
        headers: await headers(),
      });
      return data;
    }),
});
