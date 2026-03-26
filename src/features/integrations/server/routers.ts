import "server-only";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { ResourceType } from "@/generated/prisma";
import { inngest } from "@/inngest/client";
import { auth } from "@/lib/auth";
import prisma from "@/lib/db";
import { paginationInputSchema } from "@/lib/pagination";
import { fetchPaginated } from "@/lib/router-utils";
import { userIncludeSelect } from "@/lib/schemas";
import { createTRPCRouter, protectedProcedure } from "@/trpc/init";
import { integrationInputSchema } from "../types";

const paginatedIntegrationsInputSchema = paginationInputSchema.extend({
  resourceType: z.enum(Object.values(ResourceType)),
});

const integrationsInclude = {
  user: userIncludeSelect,
  syncStatus: {
    select: {
      status: true,
      syncedAt: true,
      errorMessage: true,
    },
    orderBy: {
      syncedAt: "desc", // newest first
    },
  },
  _count: {
    select: {
      assetMappings: true,
      deviceArtifactMappings: true,
      remediationMappings: true,
      vulnerabilityMappings: true,
    },
  },
} as const;

export const integrationsRouter = createTRPCRouter({
  // intentionally fetches all integrations, not just user's
  getMany: protectedProcedure
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

      return fetchPaginated(prisma.integration, input, {
        where: whereFilter,
        include: integrationsInclude,
      });
    }),

  create: protectedProcedure
    .input(integrationInputSchema)
    .mutation(async ({ ctx, input }) => {
      const { name, resourceType } = input;
      const integration = await prisma.$transaction(async (tx) => {
        const integrationUser = await tx.user.create({
          data: {
            id: crypto.randomUUID(),
            name,
          },
        });

        const integrationUserId = integrationUser.id;

        return tx.integration.create({
          data: {
            ...input,
            userId: ctx.auth.user.id,
            integrationUserId,
            apiKeyConnector: {
              create: {
                name,
                resourceType,
                userId: ctx.auth.user.id,
              },
            },
          },
          include: integrationsInclude,
        });
      });
      return integration;
    }),

  // any user can intentionally update any integration
  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        data: integrationInputSchema,
      }),
    )
    .mutation(async ({ input }) => {
      const { id, data } = input;
      return prisma.$transaction(async (tx) => {
        // Update the integration
        const integration = await tx.integration.update({
          where: { id },
          data,
          include: integrationsInclude,
        });

        // If integration has a linked user, update their name
        if (integration.integrationUserId && data.name) {
          await tx.user.update({
            where: { id: integration.integrationUserId },
            data: {
              name: data.name,
            },
          });
        }

        return integration;
      });
    }),

  // any user can intentionally remove any integration
  remove: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      return prisma.integration.delete({
        where: { id: input.id },
      });
    }),

  triggerSync: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      // any user can trigger any integration
      // but if we change so later, implement that here
      const integration = await prisma.integration.findFirst({
        where: { id: input.id },
      });
      if (!integration) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      await inngest.send({
        name: "integration/sync.requested",
        data: { integrationId: input.id },
      });

      return { success: true };
    }),
});
