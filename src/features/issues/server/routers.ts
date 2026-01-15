import { z } from "zod";
import { IssueStatus } from "@/generated/prisma";
import prisma from "@/lib/db";
import { createTRPCRouter, protectedProcedure } from "@/trpc/init";
import { deviceGroupSelect } from "@/lib/schemas";

export const issuesRouter = createTRPCRouter({
  getOne: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      return prisma.issue.findUniqueOrThrow({
        where: { id: input.id },
        include: { asset: true, vulnerability: true },
      });
    }),

  getManyByIds: protectedProcedure
    .input(
      z.object({
        ids: z.array(z.string()),
        type: z.enum(["assets", "vulnerabilities"]),
      }),
    )
    .query(async ({ input }) => {
      const { ids, type } = input;
      if (ids.length === 0) {
        return [];
      }
return prisma.issue.findMany({
  where: { id: { in: ids } },
  include: {
    ...(type === "assets" && { 
      asset: true 
    }),
    ...(type === "vulnerabilities" && { 
      vulnerability: {
        include: {
          affectedDeviceGroups: deviceGroupSelect, 
        },
      },
    }),
  },
});
    }),

  updateStatus: protectedProcedure
    .input(z.object({ id: z.string(), status: z.nativeEnum(IssueStatus) }))
    .mutation(({ input }) => {
      return prisma.issue.update({
        where: { id: input.id },
        data: { status: input.status },
      });
    }),
});
