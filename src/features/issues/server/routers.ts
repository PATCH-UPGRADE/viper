import "server-only";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { IssueStatus } from "@/generated/prisma";
import prisma from "@/lib/db";
import {
  buildPaginationMeta,
  createPaginatedResponse,
  paginationInputSchema,
} from "@/lib/pagination";
import { deviceGroupSelect } from "@/lib/schemas";
import { createTRPCRouter, protectedProcedure } from "@/trpc/init";

const issuePaginationInput = paginationInputSchema.extend({
  assetId: z.string(),
  issueStatus: z.enum(IssueStatus),
});

export const issuesRouter = createTRPCRouter({
  getOne: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      const where = { id: input.id };
      const include = {
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
      };
      // TODO: using requireExistence causes type issues with nested object includes
      // return await requireExistence(where, "issue", include);
      const issue = await prisma.issue.findUnique({
        where,
        include,
      });

      if (!issue) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Issue not found",
        });
      }

      return issue;
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
      const where = {
        assetId,
        status: issueStatus,
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
        orderBy: { createdAt: "desc" },
      });

      return createPaginatedResponse(issues, meta);
    }),
});
