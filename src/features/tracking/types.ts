import { z } from "zod";
import {
  type Prisma,
  Severity,
  TicketCategory,
  TicketSource,
  TicketStatus,
} from "@/generated/prisma";
import { createPaginatedResponseSchema } from "@/lib/pagination";

export const ticketBaseInclude = {
  departments: {
    select: { id: true, name: true, color: true },
    orderBy: { name: "asc" as const },
  },
  assignee: { select: { id: true, name: true, email: true } },
  sourceWorkflow: { select: { id: true, name: true } },
  vulnerabilities: { select: { id: true, cveId: true } },
  assets: { select: { id: true, hostname: true } },
  _count: {
    select: {
      comments: true,
      issues: true,
      vulnerabilities: true,
      remediations: true,
      advisories: true,
      assets: true,
    },
  },
} satisfies Prisma.WorkOrderTicketInclude;

export const trackingTicketInclude = {
  ...ticketBaseInclude,
  children: {
    include: ticketBaseInclude,
    orderBy: { createdAt: "asc" },
  },
} satisfies Prisma.WorkOrderTicketInclude;

type ChildPayload = Prisma.WorkOrderTicketGetPayload<{
  include: typeof ticketBaseInclude;
}>;

export type LinkedPreviewItem = { id: string; label: string };

export type TrackingTicketChildRow = ChildPayload & {
  linkedCount: number;
  commentCount: number;
  linkedPreview: LinkedPreviewItem[];
};

type ParentPayload = Prisma.WorkOrderTicketGetPayload<{
  include: typeof trackingTicketInclude;
}>;

export type TrackingTicketRow = Omit<ParentPayload, "children"> & {
  linkedCount: number;
  commentCount: number;
  linkedPreview: LinkedPreviewItem[];
  children: TrackingTicketChildRow[];
};

export const ticketDetailInclude = {
  departments: {
    select: { id: true, name: true, color: true },
    orderBy: { name: "asc" as const },
  },
  assignee: { select: { id: true, name: true, email: true } },
  creator: { select: { id: true, name: true, email: true } },
  sourceWorkflow: { select: { id: true, name: true } },
  parent: { select: { id: true, summary: true } },
  children: {
    select: {
      id: true,
      summary: true,
      status: true,
      departments: {
        select: { id: true, name: true, color: true },
        orderBy: { name: "asc" as const },
      },
      _count: { select: { comments: true } },
    },
    orderBy: { createdAt: "asc" as const },
  },
  vulnerabilities: {
    select: { id: true, cveId: true, severity: true, cvssScore: true },
  },
  assets: {
    select: {
      id: true,
      hostname: true,
      ip: true,
      role: true,
      macAddress: true,
      location: true,
      deviceGroupId: true,
      deviceGroup: {
        select: { id: true, modelName: true, manufacturer: true },
      },
    },
  },
  issues: {
    select: { id: true, status: true, assetId: true, vulnerabilityId: true },
  },
  remediations: {
    select: {
      id: true,
      description: true,
      affectedDeviceGroups: { select: { id: true } },
    },
  },
  advisories: { select: { id: true, title: true, severity: true } },
  comments: {
    include: {
      author: { select: { id: true, name: true, email: true, image: true } },
    },
    orderBy: { createdAt: "asc" as const },
  },
} satisfies Prisma.WorkOrderTicketInclude;

export type TicketDetail = Prisma.WorkOrderTicketGetPayload<{
  include: typeof ticketDetailInclude;
}>;

// Include shape for the public list endpoint — base ticket fields plus the linked
// entities most callers want to slice on.
export const workOrderListInclude = {
  departments: {
    select: { id: true, name: true, color: true },
    orderBy: { name: "asc" as const },
  },
  assignee: { select: { id: true, name: true, email: true } },
  sourceWorkflow: { select: { id: true, name: true } },
  assets: {
    select: { id: true, hostname: true, ip: true, role: true },
  },
  vulnerabilities: {
    select: { id: true, cveId: true, severity: true, cvssScore: true },
  },
  advisories: { select: { id: true, title: true, severity: true } },
  remediations: { select: { id: true, description: true } },
} satisfies Prisma.WorkOrderTicketInclude;

export type WorkOrderListItem = Prisma.WorkOrderTicketGetPayload<{
  include: typeof workOrderListInclude;
}>;

// --- Input ----------------------------------------------------------------

export const workOrderListFilterSchema = z.object({
  departmentIds: z.array(z.string()).optional(),
  assigneeIds: z.array(z.string()).optional(),
  lifeSafety: z.boolean().optional(),
});

// --- Output ---------------------------------------------------------------

const departmentItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  color: z.string().nullable(),
});

const assigneeItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().nullable(),
});

const sourceWorkflowItemSchema = z.object({
  id: z.string(),
  name: z.string(),
});

const linkedAssetSchema = z.object({
  id: z.string(),
  hostname: z.string().nullable(),
  ip: z.string(),
  role: z.string().nullable(),
});

const linkedVulnerabilitySchema = z.object({
  id: z.string(),
  cveId: z.string().nullable(),
  severity: z.enum(Severity),
  cvssScore: z.number().nullable(),
});

const linkedAdvisorySchema = z.object({
  id: z.string(),
  title: z.string().nullable(),
  severity: z.enum(Severity),
});

const linkedRemediationSchema = z.object({
  id: z.string(),
  description: z.string().nullable(),
});

export const workOrderListItemSchema = z.object({
  id: z.string(),
  summary: z.string(),
  description: z.string().nullable(),
  status: z.enum(TicketStatus),
  category: z.enum(TicketCategory),
  source: z.enum(TicketSource),
  lifeSafety: z.boolean(),
  scheduledAt: z.date().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
  parentId: z.string().nullable(),
  creatorId: z.string(),
  assigneeId: z.string().nullable(),
  sourceWorkflowId: z.string().nullable(),
  departments: z.array(departmentItemSchema),
  assignee: assigneeItemSchema.nullable(),
  sourceWorkflow: sourceWorkflowItemSchema.nullable(),
  assets: z.array(linkedAssetSchema),
  vulnerabilities: z.array(linkedVulnerabilitySchema),
  advisories: z.array(linkedAdvisorySchema),
  remediations: z.array(linkedRemediationSchema),
});

export const paginatedWorkOrderListResponseSchema =
  createPaginatedResponseSchema(workOrderListItemSchema);
