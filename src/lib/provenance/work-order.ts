import "server-only";
import type { Prisma } from "@/generated/prisma";
import { asRaw } from "@/lib/db-raw";
import type {
  EntityDefinition,
  FieldMap,
  FieldWithMark,
  ModelScalars,
} from "./types";

const fields = {
  summary: "tracked",
  body: "tracked",
  status: "tracked",
  category: "tracked",
  priority: "tracked",
  assigneeId: "tracked",
  scheduledAt: "tracked",
  scheduledEndTime: "tracked",

  // Unsure if these fields are sticking around in their current form, so not
  // having them be tracked. Plus nobody writes them.
  sourceLabel: "ignored",
  suggestedAssignee: "ignored",
  priorityReasonWhy: "ignored",

  // The CREATE observation says who made it.
  creatorId: "ignored",
  // TODO VW-605 (PR 9): the provenance functions write no rows for a draft.
  isDraft: "ignored",

  // Internal state of the submission job.
  targetIntegrationId: "ignored",
  platformPayload: "ignored",
  submissionState: "ignored",
  submissionError: "ignored",
  submittedAt: "ignored",

  // Set when VIPER creates the ticket.
  mitigationPlanId: "ignored",
  notificationId: "ignored",
  chatToolCallId: "ignored",

  // Set by the database, or computed.
  id: "ignored",
  createdAt: "ignored",
  updatedAt: "ignored",
  lastCommentAt: "ignored",

  // TODO VW-605 (PR 9): track these sets, with one FieldChange per member.
  departments: "ignored",
  assets: "ignored",
  children: "ignored",
  linksAsA: "ignored",
  linksAsB: "ignored",

  // Tracked on the parent, as one of its children or assets.
  parentId: "ignored",
  parent: "ignored",
  ticket: "ignored",

  // Tracked through their foreign key, or not at all.
  assignee: "ignored",
  creator: "ignored",
  mitigationPlan: "ignored",
  notification: "ignored",
  targetIntegration: "ignored",

  issues: "ignored",
  vulnerabilities: "ignored",
  remediations: "ignored",
  deviceGroups: "ignored",

  // Rows of other models that point at the ticket.
  sourceLinks: "ignored",
  comments: "ignored",
  seenBy: "ignored",
  activities: "ignored",
  externalMapping: "ignored",
  rescheduleRequests: "ignored",
} as const satisfies FieldMap<"WorkOrderTicket">;

type TrackedField = FieldWithMark<typeof fields, "tracked">;

const groups = {
  schedule: ["scheduledAt", "scheduledEndTime"],
} as const satisfies Record<string, readonly TrackedField[]>;

export const workOrderEntity = {
  model: "WorkOrderTicket",
  fields,
  groups,
  jsonFields: ["platformPayload"],
  emptyIsNull: ["body"],
  labels: {
    assigneeId: async (tx, id) =>
      (await tx.user.findUnique({ where: { id }, select: { name: true } }))
        ?.name,
  },
  // A source can state only a start, which must not move past the end.
  cleared: ({ scheduledEndTime: end }, applied) => {
    const start = applied.scheduledAt;
    if (start === undefined || "scheduledEndTime" in applied || !end) return [];
    const isValid =
      start !== null && new Date(end as string) > new Date(start as string);
    return isValid ? [] : ["scheduledEndTime"];
  },
  // Not FOR UPDATE: that also blocks inserting rows that point at the ticket,
  // so two transactions that each add a mapping first would deadlock.
  lock: (tx, id) =>
    tx.$queryRaw`SELECT 1 FROM work_order_ticket WHERE id = ${id} FOR NO KEY UPDATE`,
  // The lock that DELETE takes. Upgrading to it later would deadlock with a
  // transaction that adds a mapping and then locks the ticket.
  lockForDelete: (tx, id) =>
    tx.$queryRaw`SELECT 1 FROM work_order_ticket WHERE id = ${id} FOR UPDATE`,
  read: (tx, id) =>
    tx.workOrderTicket.findUnique({
      where: { id },
      omit: { platformPayload: true },
    }),
  update: (tx, id, data) =>
    asRaw(tx).workOrderTicket.update({
      where: { id },
      data: data as Prisma.WorkOrderTicketUncheckedUpdateInput,
      select: { id: true },
    }),
} as const satisfies EntityDefinition<"WorkOrderTicket">;

/**
 * The fields of a work order that a source states. A missing key means it said
 * nothing about that field, and null says the field is empty.
 */
export type WorkOrderInput = Partial<
  Pick<
    ModelScalars<"WorkOrderTicket">,
    TrackedField | "sourceLabel" | "suggestedAssignee"
  >
>;
