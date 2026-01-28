import "server-only";
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

// Helper function to create an API key for an integration
async function createIntegrationApiKey(
  integrationName: string,
  userId: string,
) {
  const BETTER_AUTH_MAX_KEY_NAME_LENGTH = 32;
  const name = `${integrationName} Integration Key`;
  const apiKey = await auth.api.createApiKey({
    body: {
      name: name.length < BETTER_AUTH_MAX_KEY_NAME_LENGTH ? name : "Integration Key",
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
        include: { syncStatus: true },
      });

      return createPaginatedResponse(items, meta);
    }),

  create: protectedProcedure
    .input(integrationInputSchema)
    .mutation(async ({ ctx, input }) => {
      console.log("API")
      const apiKey = await createIntegrationApiKey(
        input.name,
        ctx.auth.user.id,
      );

      console.log("HERE")
      const integration = await prisma.integration.create({
        data: {
          ...input,
          userId: ctx.auth.user.id,
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
        data,
        include: { syncStatus: true },
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
});
