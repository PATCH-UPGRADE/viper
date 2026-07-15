import type { EmailReceivedEvent } from "resend";
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
  vulnerabilities: {
    select: { vulnerabilityId: true },
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
  version: string | null;
  status: AssetStatus | null;
  statusNotes: string | null;
};

/** A device group matching with its resolved vendor/product/version labels. */
export type MatchingWithLabels =
  NotificationDetailBasePayload["deviceGroupsMatchings"][number]["deviceGroupMatching"];

/**
 * One device group matching in a triage bucket, with the number of assets that
 * fall in that bucket.
 */
export type AffectedAssetGroupSummary = {
  mappingId: string | null;
  deviceGroupMatching: MatchingWithLabels;
  assetCount: number;
  notesByVuln: Record<string, string>;
};

/** Device group matchings grouped by triage status for the affected-assets tab. */
export type AffectedAssetsSummary = {
  needsAttention: AffectedAssetGroupSummary[];
  needsInformation: AffectedAssetGroupSummary[];
  lowConcern: AffectedAssetGroupSummary[];
  unaffected: AffectedAssetGroupSummary[];
};

export type NotificationDetailWithRelations = Omit<
  NotificationDetailBasePayload,
  "deviceGroupsMatchings"
> & {
  deviceGroupsMatchings: (NotificationDetailBasePayload["deviceGroupsMatchings"][number] & {
    assetCount: number;
  })[];
  affectedAssets: AffectedAssetsSummary;
};

export type NotificationDetailSource =
  NotificationDetailWithRelations["sources"][number];

/**
 * The value stored in `NotificationSource.raw` for email sources
 */
export type RawEmailPayload = EmailReceivedEvent;

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
