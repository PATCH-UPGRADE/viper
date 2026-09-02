import "server-only";
import { z } from "zod";
import { assetInclude } from "@/features/assets/types";
import { deviceGroupSelect } from "@/features/device-groups/types";
import { vulnerabilityInclude } from "@/features/vulnerabilities/types";
import { IssueStatus } from "@/generated/prisma";
import prisma from "@/lib/db";
import {
  buildPaginationMeta,
  createPaginatedResponse,
  paginationInputSchema,
} from "@/lib/pagination";
import { createTRPCRouter, protectedProcedure } from "@/trpc/init";
import { requireExistence } from "@/trpc/middleware";
import { resolveEffectiveIssuesByAsset } from "./effective-issues";

const issuePaginationInput = paginationInputSchema.extend({
  assetId: z.string(),
  issueStatus: z.enum(IssueStatus),
});

export const issuesRouter = createTRPCRouter({
  getOne: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      const issue = await prisma.issue.findUnique({
        where: { id: input.id },
        include: {
          asset: {
            include: assetInclude,
          },
          vulnerability: {
            include: vulnerabilityInclude,
          },
        },
      });
      return requireExistence(issue, "Issue");
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
                deviceGroupMatchings: true,
              },
            },
          }),
        },
      });
    }),

  updateStatus: protectedProcedure
    .input(z.object({ id: z.string(), status: z.enum(IssueStatus) }))
    .mutation(({ input }) => {
      return prisma.issue.update({
        where: { id: input.id },
        data: { status: input.status },
      });
    }),

  getManyInternalByStatusAndAssetId: protectedProcedure
    .input(issuePaginationInput)
    .query(async ({ input }) => {
      const { assetId, issueStatus } = input;

      const asset = await prisma.asset.findUnique({
        where: { id: assetId },
        select: { id: true, deviceGroupId: true },
      });
      const found = requireExistence(asset, "Asset");

      const effectiveIssuesByAssetId = await resolveEffectiveIssuesByAsset(
        [found],
        { vulnerability: true },
      );
      const effectiveIssues = (effectiveIssuesByAssetId.get(found.id) ?? [])
        .filter((issue) => issue.status === issueStatus)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

      const meta = buildPaginationMeta(input, effectiveIssues.length);
      const items = effectiveIssues.slice(meta.skip, meta.skip + meta.take);
      return createPaginatedResponse(items, meta);
    }),
});
