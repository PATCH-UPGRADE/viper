import type { Prisma } from "@/generated/prisma";

export const ticketBaseInclude = {
  department: { select: { id: true, name: true, color: true } },
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
  department: { select: { id: true, name: true, color: true } },
  assignee: { select: { id: true, name: true, email: true } },
  creator: { select: { id: true, name: true, email: true } },
  sourceWorkflow: { select: { id: true, name: true } },
  parent: { select: { id: true, summary: true } },
  children: {
    select: {
      id: true,
      summary: true,
      status: true,
      department: { select: { id: true, name: true, color: true } },
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
  issues: { select: { id: true, status: true, assetId: true, vulnerabilityId: true } },
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
