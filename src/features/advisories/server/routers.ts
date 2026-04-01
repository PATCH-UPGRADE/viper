import "server-only";
import { z } from "zod";
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
    .query(async ({ ctx, input }) => {
      const { search } = input;
      const searchFilter = createSearchFilter(search);
      const where = { userId: ctx.auth.user.id, ...searchFilter };

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
      return {
        ...found,
        affectedAssets: getAffectedAssets(found),
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
