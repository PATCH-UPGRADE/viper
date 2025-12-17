import { IssueStatus } from "@/generated/prisma";
import prisma from "@/lib/db";
import { createTRPCRouter, protectedProcedure } from "@/trpc/init";
import z from "zod";

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
      return prisma.issue.findMany({
        where: { id: { in: ids } },
        include: {
          asset: type === "assets",
          vulnerability: type === "vulnerabilities",
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
