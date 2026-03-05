import z from "zod";
import prisma from "@/lib/db";
import { createTRPCRouter, protectedProcedure } from "@/trpc/init";

const connectorCountResponseSchema = z.object({
  counts: z.array(
    z.object({
      resourceType: z.string().nullable(), // nulls are filtered out in where clause but make this nullable to keep TS happy
      _count: z.object({
        resourceType: z.number(),
      }),
    }),
  ),
});

export const apiKeyConnectorsRouter = createTRPCRouter({
  getManyTypeCountInternal: protectedProcedure
    .output(connectorCountResponseSchema)
    .query(async () => {
      const counts = await prisma.apiKeyConnector.groupBy({
        by: ["resourceType"],
        _count: {
          resourceType: true,
        },
        where: {
          resourceType: { not: null },
        },
      });

      return {
        counts,
      };
    }),
});
