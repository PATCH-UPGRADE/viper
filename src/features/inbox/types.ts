import { z } from "zod";
import {
  type AssetStatus,
  type Prisma,
  TicketCategory,
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
  deviceGroupsMatchings: (NotificationDetailBasePayload["deviceGroupsMatchings"][number] & {
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

// Routes a relevant email to the right entity: an informational Notification or
// an actionable Work Order. Kept a flat object (Anthropic tool-schema rule).
export const emailKindSchema = z.object({
  kind: z.enum(["notification", "work_order"]),
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
