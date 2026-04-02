import "server-only";
import { z } from "zod";
import { assetDashboardInclude } from "@/features/assets/types";
import { IssueStatus } from "@/generated/prisma";
import prisma from "@/lib/db";
import {
  buildPaginationMeta,
  createPaginatedResponse,
  paginationInputSchema,
} from "@/lib/pagination";
import { createTRPCRouter, protectedProcedure } from "@/trpc/init";
import { requireExistence } from "@/trpc/middleware";
import {
  type AdvisoryWithRelations,
  advisoryInclude,
  getAffectedAssets,
} from "../types";

const createSearchFilter = (search: string) => {
  return search
    ? {
        OR: [
          { title: { contains: search, mode: "insensitive" as const } },
          { summary: { contains: search, mode: "insensitive" as const } },
        ],
      }
    : {};
};

export const advisoriesRouter = createTRPCRouter({
  getMany: protectedProcedure
    .input(paginationInputSchema)
    .query(async ({ input }) => {
      const { search } = input;
      const where = createSearchFilter(search);

      const totalCount = await prisma.advisory.count({ where });
      const meta = buildPaginationMeta(input, totalCount);

      const advisories = await prisma.advisory.findMany({
        skip: meta.skip,
        take: meta.take,
        where,
        include: advisoryInclude,
        orderBy: { updatedAt: "desc" },
      });

      const items = advisories.map((advisory: AdvisoryWithRelations) => ({
        ...advisory,
        affectedAssetCount: getAffectedAssets(advisory).length,
      }));

      return createPaginatedResponse(items, meta);
    }),

  getOne: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      const advisory = await prisma.advisory.findUnique({
        where: { id: input.id },
        include: advisoryInclude,
      });
      const found = requireExistence(advisory, "Advisory");

      const vulnIds = found.referencedVulnerabilities.map((v) => v.id);
      const affectedAssetIds = getAffectedAssets(found).map((a) => a.id);

      const affectedAssetsWithIssues = await prisma.asset.findMany({
        where: { id: { in: affectedAssetIds } },
        include: {
          ...assetDashboardInclude,
          issues: {
            where: { vulnerabilityId: { in: vulnIds } },
            include: assetDashboardInclude.issues.include,
          },
        },
      });

      const allIssues = affectedAssetsWithIssues.flatMap((a) => a.issues);
      const nonActiveCount = allIssues.filter(
        (i) => i.status !== IssueStatus.ACTIVE,
      ).length;
      const progressPercent =
        allIssues.length > 0
          ? Math.round((nonActiveCount / allIssues.length) * 100)
          : 0;

      return {
        ...found,
        affectedAssets: getAffectedAssets(found),
        affectedAssetsWithIssues,
        progressPercent,
      };
    }),

  updateStatus: protectedProcedure
    .input(z.object({ id: z.string(), status: z.enum(IssueStatus) }))
    .mutation(({ input }) => {
      return prisma.advisory.update({
        where: { id: input.id },
        data: { status: input.status },
      });
    }),
});
