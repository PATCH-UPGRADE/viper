import { z } from "zod";
import type { Prisma } from "@/generated/prisma";

export const notificationInclude = {
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
  reads: {
    select: { id: true },
  },
} satisfies Prisma.NotificationInclude;

export type NotificationWithRelations = Prisma.NotificationGetPayload<{
  include: typeof notificationInclude;
}>;

export type NotificationSource = NotificationWithRelations["sources"][number];

export const notificationDetailInclude = {
  deviceGroups: {
    include: {
      deviceGroup: {
        include: {
          vendor: true,
          product: true,
          _count: { select: { assets: true } },
          assets: {
            select: {
              id: true,
              ip: true,
              hostname: true,
              location: true,
              status: true,
            },
          },
        },
      },
    },
  },
  sources: {
    select: {
      id: true,
      channel: true,
      raw: true,
      markdown: true,
      receivedAt: true,
      referenceUrl: true,
    },
  },
  reads: {
    select: { id: true },
  },
} satisfies Prisma.NotificationInclude;

export type NotificationDetailWithRelations = Prisma.NotificationGetPayload<{
  include: typeof notificationDetailInclude;
}>;

export type NotificationDetailSource =
  NotificationDetailWithRelations["sources"][number];

export type RawEmailPayload = {
  from: string;
  subject?: string;
  to?: string;
};

// TODO: Get a discriminated union of what fields should actually live on Advisory|Recall|UpdateAvailable (see `details`)
export const notificationPayloadSchema = z.object({
  type: z.enum(["Advisory", "Recall", "UpdateAvailable", "Other"]),
  title: z.string(),
  summary: z.string(),
  tlp: z
    .enum(["WHITE", "GREEN", "AMBER", "RED", "CLEAR", "AMBER_STRICT"])
    .nullable(),
});

export type NotificationPayload = z.infer<typeof notificationPayloadSchema>;
