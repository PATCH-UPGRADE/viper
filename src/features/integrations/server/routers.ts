import "server-only";
import { TRPCError } from "@trpc/server";
import { headers } from "next/headers";
import { z } from "zod";
import { inngest } from "@/inngest/client";
import { auth } from "@/lib/auth";
import prisma from "@/lib/db";
import {
  buildPaginationMeta,
  createPaginatedResponse,
  paginationInputSchema,
} from "@/lib/pagination";
import { createTRPCRouter, protectedProcedure } from "@/trpc/init";
import { integrationInputSchema } from "../types";
import { ResourceType } from "@/generated/prisma";
import { userIncludeSelect } from "@/lib/schemas";

const paginatedIntegrationsInputSchema = paginationInputSchema.extend({
  resourceType: z.enum(ResourceType),
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
      syncedAt: 'desc' // newest first
    }
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
        include: integrationsInclude,
      });

      return createPaginatedResponse(items, meta);
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
          authentication: input.authentication ?? undefined,
          userId: ctx.auth.user.id,
          integrationUserId: integrationUser.id,
          apiKeyId: apiKey.id,
        },
        include: { syncStatus: true },
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
      // require ownership of integration to rotate an api key
      const integration = await prisma.integration.findUniqueOrThrow({
        where: { id: input.id, userId: ctx.auth.user.id },
        select: { apiKeyId: true, name: true, userId: true },
      });

      console.log("HEY", integration, input, integration.apiKeyId)

      // delete the existing API key if it exists
      if (integration.apiKeyId) {
        await auth.api.deleteApiKey({
          body: {
            keyId: integration.apiKeyId,
          },
          headers: await headers(),
        });
      }

      // generate a new API key
      const newApiKey = await createIntegrationApiKey(
        integration.name,
        ctx.auth.user.id,
      );

      // update integration with new key
      await prisma.integration.update({
        where: { id: input.id },
        data: { apiKeyId: newApiKey.id },
      });

      return {
        apiKey: newApiKey,
      };
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
        data: {
          ...data,
          authentication: data.authentication ?? undefined
        },
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
