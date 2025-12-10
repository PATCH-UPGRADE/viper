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

  updateStatus: protectedProcedure
    .input(z.object({ id: z.string(), status: z.string() }))
    .mutation(({ input }) => {
      return prisma.issue.update({
        where: { id: input.id },
        data: { status: input.status as IssueStatus },
      });
    }),
});
