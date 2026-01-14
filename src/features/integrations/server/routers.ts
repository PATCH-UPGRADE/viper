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
import { integrationInputSchema } from "../types";

const paginatedIntegrationsInputSchema = paginationInputSchema.extend({
  resourceType: z.enum(["Asset", "Vulnerability", "Emulator", "Remediation"]),
});

export const integrationsRouter = createTRPCRouter({
  getManyIntegrations: protectedProcedure
    .input(paginatedIntegrationsInputSchema)
    .query(async ({ input }) => {
      const { search, resourceType } = input;

      const whereFilter = {
        resourceType: resourceType,
        name: {
          contains: search,
          mode: "insensitive" as const,
        },
      };

      // Get total count and build pagination metadata
      const totalCount = await prisma.integration.count({
        where: whereFilter,
      });
      const meta = buildPaginationMeta(input, totalCount);

      // Fetch paginated items
      const items = await prisma.integration.findMany({
        skip: meta.skip,
        take: meta.take,
        where: whereFilter,
        orderBy: { createdAt: "desc" },
        include: { syncStatus: true },
      });

      return createPaginatedResponse(items, meta);
    }),

  createIntegration: protectedProcedure
    .input(integrationInputSchema)
    .mutation(async ({ ctx, input }) => {
      return prisma.integration.create({
        data: {
          ...input,
          userId: ctx.auth.user.id,
          // TODO: get resourceType from a param maybe?
        },
        include: { syncStatus: true },
      });
      // TODO: create inngest job?
    }),

  updateIntegration: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        data: integrationInputSchema,
      }),
    )
    .mutation(async ({ input }) => {
      const { id, data } = input;
      return prisma.integration.update({
        where: { id },
        data,
        include: { syncStatus: true },
      });
    }),

  removeIntegration: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      return prisma.integration.delete({
        where: { id: input.id },
      });
    }),
});
