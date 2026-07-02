import { z } from "zod";
import type { AssetStatus, Prisma } from "@/generated/prisma";

export const notificationInclude = {
  deviceGroupsMatchings: {
    include: {
      deviceGroupMatching: {
        include: {
          vendor: true,
          product: true,
          version: true,
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

type NotificationBasePayload = Prisma.NotificationGetPayload<{
  include: typeof notificationInclude;
}>;

export type NotificationWithRelations = Omit<
  NotificationBasePayload,
  "deviceGroupsMatchings"
> & {
  deviceGroupsMatchings: (NotificationBasePayload["deviceGroupsMatchings"][number] & {
    assetCount: number;
  })[];
};

export type NotificationSource = NotificationWithRelations["sources"][number];

export const notificationDetailInclude = {
  deviceGroupsMatchings: {
    include: {
      deviceGroupMatching: {
        include: {
          vendor: true,
          product: true,
          version: true,
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

type NotificationDetailBasePayload = Prisma.NotificationGetPayload<{
  include: typeof notificationDetailInclude;
}>;

export type ResolvedDeviceGroupAsset = {
  id: string;
  ip: string;
  hostname: string | null;
  location: unknown;
  status: AssetStatus | null;
};

export type NotificationDetailWithRelations = Omit<
  NotificationDetailBasePayload,
  "deviceGroupsMatchings"
> & {
  deviceGroupMatchings: (NotificationDetailBasePayload["deviceGroupsMatchings"][number] & {
    assetCount: number;
    assets: ResolvedDeviceGroupAsset[];
  })[];
};

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
