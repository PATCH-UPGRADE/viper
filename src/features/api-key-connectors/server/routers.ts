import z from "zod";
import { ResourceType } from "@/generated/prisma";
import prisma from "@/lib/db";
import { createTRPCRouter, protectedProcedure } from "@/trpc/init";

// { "Asset": 2, "Vulnerability": 5, "Remediation": 3, ... }
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

        // an active conn is if a key is present and in use OR has an integration
        if (conn.apiKeyId) {
          if (conn.lastRequest) {
            activeCount[type] += 1;
          } else if (conn.integrationId) {
            activeCount[type] += 1;
          }
        }
      }

      return { activeCount, totalCount };
    }),
});
