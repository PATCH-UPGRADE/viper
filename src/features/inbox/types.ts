import type { EmailReceivedEvent } from "resend";
import { z } from "zod";
import {
  type AssetStatus,
  type Prisma,
  TicketCategory,
  VersionStatus,
} from "@/generated/prisma";

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
  versionStatus: VersionStatus;
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

export const hospitalImpactSchema = z.object({
  byline: z.string(),
  impactStatement: z.string(),
  careAreas: z.string(),
  likelihood: z.string(),
});

export type HospitalImpact = z.infer<typeof hospitalImpactSchema>;

// The single triage decision for an inbound email: drop it, or route it to an
// informational Notification or an actionable Work Order. Kept a flat object
// (Anthropic tool-schema rule).
export const emailKindSchema = z.object({
  kind: z.enum(["not_relevant", "notification", "work_order"]),
  reasonWhy: z.string(),
});

export type EmailKind = z.infer<typeof emailKindSchema>["kind"];

// Fields extracted from an actionable email to populate a WorkOrderTicket. The
// body is taken from the email markdown directly (not from the model).
export const workOrderPayloadSchema = z.object({
  summary: z.string().describe("concise, action-oriented ticket title"),
  category: z
    .enum(TicketCategory)
    .describe("best-fit work category; use OTHER if unsure"),
  scheduledAt: z
    .string()
    .nullable()
    .describe("ISO 8601 date if a due/scheduled date is stated, else null"),
  suggestedAssignee: z
    .string()
    .nullable()
    .describe("the responsible vendor/person if named, else null"),
  departmentNames: z
    .array(z.string())
    .describe("hospital department names implied by the email; [] if none"),
});

export type WorkOrderPayload = z.infer<typeof workOrderPayloadSchema>;
