import { z } from "zod";
import {
  IssueStatus,
  type Prisma,
  Severity,
  TicketActivityType,
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
  // `seenBy` is replaced at the procedure level with a where: { userId } filter.
  // Including it here keeps the derived TS type consistent across call sites.
  seenBy: { select: { seenAt: true } },
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
  descriptions: {
    include: {
      department: { select: { id: true, name: true, color: true } },
    },
    orderBy: { department: { name: "asc" as const } },
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
        select: {
          id: true,
          vendorId: true,
          productId: true,
          versionId: true,
          vendor: { select: { canonicalDisplayName: true } },
          product: { select: { canonicalDisplayName: true } },
          version: { select: { canonicalName: true } },
        },
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
      deviceGroupMatchings: {
        select: {
          vendorId: true,
          productId: true,
          versionId: true,
          versionRange: true,
        },
      },
    },
  },
  advisories: { select: { id: true, title: true, severity: true } },
  comments: {
    include: {
      author: {
        select: {
          id: true,
          name: true,
          email: true,
          image: true,
          department: { select: { id: true, name: true, color: true } },
        },
      },
    },
    orderBy: { createdAt: "asc" as const },
  },
  // Replaced at the procedure level with a where: { userId } filter.
  seenBy: { select: { seenAt: true } },
  activities: {
    include: {
      user: { select: { id: true, name: true, image: true } },
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
  // Replaced at the procedure level with a where: { userId } filter.
  seenBy: { select: { seenAt: true } },
} satisfies Prisma.WorkOrderTicketInclude;

export type WorkOrderListItem = Prisma.WorkOrderTicketGetPayload<{
  include: typeof workOrderListInclude;
}>;

// --- Input ----------------------------------------------------------------

export const workOrderListFilterSchema = z.object({
  departmentIds: z.array(z.string()).optional(),
  assigneeIds: z.array(z.string()).optional(),
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
  status: z.enum(TicketStatus),
  category: z.enum(TicketCategory),
  source: z.enum(TicketSource),
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
  lastSeenAt: z.date().nullable(),
});

export const paginatedWorkOrderListResponseSchema =
  createPaginatedResponseSchema(workOrderListItemSchema);

// --- Detail-view schemas (getOne, update, attach/detach asset) ----------------

const ticketCreatorSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().nullable(),
});

const ticketParentRefSchema = z
  .object({ id: z.string(), summary: z.string() })
  .nullable();

const ticketChildRefSchema = z.object({
  id: z.string(),
  summary: z.string(),
  status: z.enum(TicketStatus),
  departments: z.array(departmentItemSchema),
  _count: z.object({ comments: z.number() }),
});

const ticketCommentAuthorSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().nullable(),
  image: z.string().nullable(),
  department: departmentItemSchema.nullable(),
});

export const ticketCommentResponseSchema = z.object({
  id: z.string(),
  ticketId: z.string(),
  authorId: z.string(),
  body: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
  author: ticketCommentAuthorSchema,
});

const detailLinkedAssetSchema = linkedAssetSchema.extend({
  macAddress: z.string().nullable(),
  // Prisma's Json column. Using z.any() so the inferred TS type is `any`,
  // which stays assignable to Prisma.JsonValue on the UI side.
  location: z.any(),
  deviceGroupId: z.string(),
  deviceGroup: z.object({
    id: z.string(),
    vendorId: z.string().nullable(),
    productId: z.string().nullable(),
    versionId: z.string().nullable(),
    vendor: z.object({ canonicalDisplayName: z.string() }).nullable(),
    product: z.object({ canonicalDisplayName: z.string() }).nullable(),
    version: z.object({ canonicalName: z.string() }).nullable(),
  }),
});

const detailLinkedRemediationSchema = z.object({
  id: z.string(),
  description: z.string().nullable(),
  deviceGroupMatchings: z.array(
    z.object({
      vendorId: z.string(),
      productId: z.string().nullable(),
      versionId: z.string().nullable(),
      versionRange: z.string().nullable(),
    }),
  ),
});

const ticketIssueSchema = z.object({
  id: z.string(),
  status: z.enum(IssueStatus),
  assetId: z.string(),
  vulnerabilityId: z.string(),
});

const ticketSeenBySchema = z.array(z.object({ seenAt: z.date() }));

const ticketActivityUserSchema = z.object({
  id: z.string(),
  name: z.string(),
  image: z.string().nullable(),
});

export const ticketActivitySchema = z.object({
  id: z.string(),
  ticketId: z.string(),
  userId: z.string(),
  type: z.enum(TicketActivityType),
  // Shape varies by `type`; documented in the API description rather than
  // enumerated in the schema (too noisy for OpenAPI).
  // biome-ignore lint/suspicious/noExplicitAny: Json blob with type-specific shape
  data: z.any() as z.ZodType<any>,
  createdAt: z.date(),
  user: ticketActivityUserSchema,
});

const ticketDescriptionSchema = z.object({
  id: z.string(),
  ticketId: z.string(),
  departmentId: z.string(),
  body: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
  department: departmentItemSchema,
});

export const workOrderDetailResponseSchema = z.object({
  id: z.string(),
  summary: z.string(),
  status: z.enum(TicketStatus),
  category: z.enum(TicketCategory),
  source: z.enum(TicketSource),
  scheduledAt: z.date().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
  lastCommentAt: z.date().nullable(),
  parentId: z.string().nullable(),
  creatorId: z.string(),
  assigneeId: z.string().nullable(),
  sourceWorkflowId: z.string().nullable(),
  departments: z.array(departmentItemSchema),
  descriptions: z.array(ticketDescriptionSchema),
  assignee: assigneeItemSchema.nullable(),
  sourceWorkflow: sourceWorkflowItemSchema.nullable(),
  creator: ticketCreatorSchema,
  parent: ticketParentRefSchema,
  children: z.array(ticketChildRefSchema),
  assets: z.array(detailLinkedAssetSchema),
  vulnerabilities: z.array(linkedVulnerabilitySchema),
  advisories: z.array(linkedAdvisorySchema),
  remediations: z.array(detailLinkedRemediationSchema),
  issues: z.array(ticketIssueSchema),
  comments: z.array(ticketCommentResponseSchema),
  seenBy: ticketSeenBySchema,
  activities: z.array(ticketActivitySchema),
});
