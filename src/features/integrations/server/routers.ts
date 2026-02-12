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
      vulnerabilityMappings: true,
    },
  },
} as const;

// Helper function to create an API key for an integration
async function createIntegrationApiKey(
  integrationName: string,
  userId: string,
) {
  // better auth api keys fail to get created if name is too long
  const BETTER_AUTH_MAX_KEY_NAME_LENGTH = 32;
  const name = `${integrationName} Integration Key`;
  const apiKey = await auth.api.createApiKey({
    body: {
      name:
        name.length < BETTER_AUTH_MAX_KEY_NAME_LENGTH
          ? name
          : "Integration Key",
      expiresIn: null,
      userId,
    },
  });
  return apiKey;
}

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
      const integrationUser = await prisma.user.create({
        data: {
          id: crypto.randomUUID(),
          name: input.name,
        },
      });

      const apiKey = await createIntegrationApiKey(
        input.name,
        integrationUser.id,
      );

      const integration = await prisma.integration.create({
        data: {
          ...input,
          userId: ctx.auth.user.id,
          integrationUserId: integrationUser.id,
          apiKeyId: apiKey.id,
        },
        include: integrationsInclude,
      });

      return {
        integration,
        apiKey,
      };
    }),

  // Rotate key mutation. Returns an api key.
  rotateKey: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const result = await prisma.$transaction(async (tx) => {
        // Require ownership of integration to rotate an API key
        const integration = await tx.integration.findUniqueOrThrow({
          where: { id: input.id, userId: ctx.auth.user.id },
          select: { apiKeyId: true, name: true, userId: true },
        });

        // Delete the existing API key if it exists
        // use prisma to do this instead of better-auth since user doesn't own
        //   the integration apikey, the integration user does
        if (integration.apiKeyId) {
          await tx.apikey.delete({
            where: { id: integration.apiKeyId },
          });
        }
        return { integrationName: integration.name };
      });

      const newApiKey = await createIntegrationApiKey(
        result.integrationName,
        ctx.auth.user.id,
      );

      await prisma.integration.update({
        where: { id: input.id },
        data: { apiKeyId: newApiKey.id },
      });

      return { apiKey: newApiKey };
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
      return prisma.integration.update({
        where: { id },
        data,
        include: integrationsInclude,
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
