import "server-only";
import { z } from "zod";
import { NotificationType, Priority } from "@/generated/prisma";
import prisma from "@/lib/db";
import {
  buildPaginationMeta,
  createPaginatedResponse,
  paginationInputSchema,
} from "@/lib/pagination";
import { createTRPCRouter, protectedProcedure } from "@/trpc/init";
import { notificationDetailInclude } from "../types";

const ALLOWED_SORT_FIELDS = new Set(["priority", "updatedAt", "createdAt"]);

function getSortValue(segment: string): "asc" | "desc" {
  return segment.startsWith("-") ? "desc" : "asc";
}

const notificationInclude = {
  deviceGroups: {
    include: {
      deviceGroup: {
        include: {
          vendor: true,
          product: true,
          _count: { select: { assets: true } },
        },
      },
    },
  },
  sources: {
    select: { id: true, channel: true, raw: true, receivedAt: true },
  },
} as const;

const createSearchFilter = (search: string) => {
  if (!search) return {};
  const insensitive = { contains: search, mode: "insensitive" as const };
  return {
    OR: [{ title: insensitive }, { summary: insensitive }],
  };
};

export const notificationsRouter = createTRPCRouter({
  getMany: protectedProcedure
    .input(
      paginationInputSchema.extend({
        priority: z.array(z.nativeEnum(Priority)).default([]),
        type: z.array(z.nativeEnum(NotificationType)).default([]),
      }),
    )
    .query(async ({ input, ctx }) => {
      const { search, sort, priority, type } = input;

      const where = {
        AND: [
          createSearchFilter(search),
          priority.length > 0 ? { priority: { in: priority } } : {},
          type.length > 0 ? { type: { in: type } } : {},
        ],
      };

      const sortClauses = sort
        ? sort.split(",").flatMap((s) => {
            const field = s.replace("-", "");
            if (!ALLOWED_SORT_FIELDS.has(field)) return [];
            return [{ [field]: getSortValue(s) }];
          })
        : [];

      const totalCount = await prisma.notification.count({ where });
      const meta = buildPaginationMeta(input, totalCount);

      const notifications = await prisma.notification.findMany({
        skip: meta.skip,
        take: meta.take,
        where,
        include: {
          ...notificationInclude,
          reads: {
            where: { userId: ctx.auth.user.id },
            select: { id: true },
          },
        },
        orderBy:
          sortClauses.length > 0
            ? [...sortClauses, { updatedAt: "desc" }]
            : { updatedAt: "desc" },
      });

      return createPaginatedResponse(notifications, meta);
    }),

  getOne: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input, ctx }) => {
      const notification = await prisma.notification.findUnique({
        where: { id: input.id },
        include: {
          ...notificationDetailInclude,
          reads: {
            where: { userId: ctx.auth.user.id },
            select: { id: true },
          },
        },
      });

      if (!notification) {
        throw new Error("Notification not found");
      }

      return notification;
    }),

  markRead: protectedProcedure
    .input(z.object({ notificationId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      await prisma.notificationRead.upsert({
        where: {
          notificationId_userId: {
            notificationId: input.notificationId,
            userId: ctx.auth.user.id,
          },
        },
        update: {},
        create: {
          notificationId: input.notificationId,
          userId: ctx.auth.user.id,
        },
      });
    }),
});
