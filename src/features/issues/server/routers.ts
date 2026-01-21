import { z } from "zod";
import { IssueStatus } from "@/generated/prisma";
import prisma from "@/lib/db";
import { createTRPCRouter, protectedProcedure } from "@/trpc/init";
import {
  buildPaginationMeta,
  createPaginatedResponse,
  paginationInputSchema,
} from "@/lib/pagination";

const issuePaginationInput = paginationInputSchema.extend({
  id: z.string(),
  status: z.string(),
});

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

  getManyInternalByAssetId: protectedProcedure
    .input(issuePaginationInput)
    .query(async ({ input }) => {
      const { id, status } = input;
      const statusEnum = IssueStatus[status as keyof typeof IssueStatus];

      const where = {
        assetId: id,
        status: statusEnum,
      };

      // Get total count and build pagination metadata
      const totalCount = await prisma.issue.count({ where: where });
      const meta = buildPaginationMeta(input, totalCount);

      // Fetch paginated items
      const issues = await prisma.issue.findMany({
        skip: meta.skip,
        take: meta.take,
        where: where,
        include: { vulnerability: true },
      });

      return createPaginatedResponse(issues, meta);
    }),
});
