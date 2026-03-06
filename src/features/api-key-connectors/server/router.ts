import z from "zod";
import prisma from "@/lib/db";
import { createTRPCRouter, protectedProcedure } from "@/trpc/init";

const connectorCountResponseSchema = z.object({
  counts: z.array(
    z.object({
      resourceType: z.string(),
      count: z.number(),
    }),
  ),
});

export const apiKeyConnectorsRouter = createTRPCRouter({
  getManyTypeCountInternal: protectedProcedure
    .output(connectorCountResponseSchema)
    .query(async ({ ctx }) => {
      const countsResult = await prisma.apiKeyConnector.groupBy({
        by: ["resourceType"],
        _count: {
          resourceType: true,
        },
        where: {
          apiKeyId: { not: null },
          resourceType: { not: null },
          apiKey: {
            userId: ctx.auth.user.id,
          },
        },
      });

      const counts = countsResult.map((conn) => {
        return {
          resourceType: conn.resourceType as string, // where clause filters out nulls
          count: conn._count.resourceType,
        };
      });

      return { counts };
    }),
});
