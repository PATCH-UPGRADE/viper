import z from "zod";
import { ResourceType } from "@/generated/prisma";
import prisma from "@/lib/db";
import { createTRPCRouter, protectedProcedure } from "@/trpc/init";

const resourceTypeCountSchema = z.object(
  Object.fromEntries(
    Object.values(ResourceType).map((type) => [type, z.number()]),
  ),
);

const connectorCountResponseSchema = z.object({
  activeCount: resourceTypeCountSchema,
  totalCount: resourceTypeCountSchema,
});

export const apiKeyConnectorsRouter = createTRPCRouter({
  getManyTypeCountInternal: protectedProcedure
    .output(connectorCountResponseSchema)
    .query(async () => {
      const connectors = await prisma.apiKeyConnector.findMany({
        select: {
          resourceType: true,
          lastRequest: true,
          apiKeyId: true,
          integrationId: true,
        },
        where: {
          resourceType: { not: null },
        },
      });

      const activeCount: Record<string, number> = {};
      const totalCount: Record<string, number> = {};

      for (const type of Object.values(ResourceType)) {
        activeCount[type] = 0;
        totalCount[type] = 0;
      }

      for (const conn of connectors) {
        const type = conn.resourceType as string; // where clause filters out nulls
        totalCount[type] += 1;
        // active is when lastRequested & apiKey are not null
        if (conn.lastRequest && conn.apiKeyId) {
          activeCount[type] += 1;
        }
        // also count the integration if present
        if (conn.integrationId) {
          totalCount[type] += 1;
        }
      }

      return { activeCount, totalCount };
    }),
});
