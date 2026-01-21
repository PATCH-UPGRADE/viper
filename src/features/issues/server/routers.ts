import "server-only";
import { z } from "zod";
import { IssueStatus } from "@/generated/prisma";
import prisma from "@/lib/db";
import { deviceGroupSelect } from "@/lib/schemas";
import { createTRPCRouter, protectedProcedure } from "@/trpc/init";

export const issuesRouter = createTRPCRouter({
  getOne: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      return prisma.issue.findUniqueOrThrow({
        where: { id: input.id },
        include: {
          asset: {
            include: {
              deviceGroup: deviceGroupSelect,
            },
          },
          vulnerability: {
            include: {
              affectedDeviceGroups: deviceGroupSelect,
            },
          },
        },
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
            asset: {
              include: {
                deviceGroup: deviceGroupSelect,
              },
            },
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
