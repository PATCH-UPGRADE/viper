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
      // Better auth, for some reason, defaults to an API key that can only be
      // used 10 times daily and never refills. Here are more sensible values.
      remaining: 100,
      refillAmount: 100,
      refillInterval: 1000,
      rateLimitTimeWindow: 1000,
      rateLimitMax: 100,
      rateLimitEnabled: true,
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
      const { name, resourceType } = input;

      // createIntegrationApiKey can't run inside a transaction, so
      // create user and API key first
      const integrationUser = await prisma.user.create({
        data: {
          id: crypto.randomUUID(),
          name,
        },
      });

      const integrationUserId = integrationUser.id;
      const apiKey = await createIntegrationApiKey(name, integrationUserId);

      // create integration and link the user inside a tx
      const integration = await prisma.$transaction(async (tx) => {
        const integration = await tx.integration.create({
          data: {
            ...input,
            userId: ctx.auth.user.id,
            apiKeyId: apiKey.id,
            apiKeyConnector: {
              create: {
                name,
                resourceType,
                apiKeyId: apiKey.id,
                userId: ctx.auth.user.id,
              },
            },
          },
          include: integrationsInclude,
        });

        // Link the integration user back to the integration
        await tx.user.update({
          where: { id: integrationUserId },
          data: { integrationUserId: integration.id },
        });

        return integration;
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
          select: {
            apiKeyId: true,
            name: true,
            userId: true,
            integrationUser: true,
            apiKeyConnector: true,
          },
        });

        // an integration should always have an integrationUserId
        const integrationUserId = integration.integrationUser?.id;
        if (!integrationUserId) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Integration user missing!",
          });
        }

        // Delete the existing API key if it exists
        // use prisma to do this instead of better-auth since user doesn't own
        //   the integration apikey, the integration user does
        if (integration.apiKeyId) {
          await tx.apikey.delete({
            where: { id: integration.apiKeyId },
          });
        }

        return {
          integrationName: integration.name,
          integrationUserId,
          apiKeyConnectorId: integration.apiKeyConnector?.id,
          lastRequest: integration.apiKeyConnector?.lastRequest,
        };
      });

      const {
        integrationName,
        integrationUserId,
        apiKeyConnectorId,
        lastRequest,
      } = result;

      const newApiKey = await createIntegrationApiKey(
        integrationName,
        integrationUserId,
      );

      const newApiKeyId = newApiKey.id;

      await prisma.$transaction(async (tx) => {
        await tx.integration.update({
          where: { id: input.id },
          data: { apiKeyId: newApiKeyId },
        });

        // integrations should always come with a connector even
        // if connectors sometimes don't come with integrations
        if (apiKeyConnectorId) {
          await tx.apiKeyConnector.update({
            where: { id: apiKeyConnectorId },
            data: {
              apiKeyId: newApiKeyId,
              lastRequest,
            },
          });
        }
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
