import "server-only";
import { type TicketCategory, TicketStatus } from "@/generated/prisma";
import prisma, { type TransactionClient } from "@/lib/db";

// Activity rows are intentionally lightweight: `type` is the discriminator,
// `data` is a Json blob whose shape varies. We snapshot human-readable values
// (names, summaries) at the moment of change so deleting the referenced
// entity later doesn't render the audit trail unreadable.

type DepartmentSnapshot = {
  id: string;
  name: string;
  color: string | null;
};

type AssigneeSnapshot = { id: string; name: string } | null;

type BeforeTicket = {
  summary: string;
  body: string | null;
  status: TicketStatus;
  category: TicketCategory;
  scheduledAt: Date | null;
  assigneeId: string | null;
  assignee: AssigneeSnapshot;
  departments: DepartmentSnapshot[];
  descriptions: { departmentId: string; body: string }[];
};

export type DescriptionInput = { departmentId: string; body: string };

type UpdateInput = {
  summary?: string;
  body?: string | null;
  status?: TicketStatus;
  category?: TicketCategory;
  departmentIds?: string[];
  descriptions?: DescriptionInput[];
  assigneeId?: string | null;
  scheduledAt?: Date | null;
};

/**
 * Snapshot the fields needed to diff an `update` mutation. Call this BEFORE
 * applying the update so we can compare against the input.
 */
export async function snapshotBeforeUpdate(
  tx: TransactionClient,
  ticketId: string,
): Promise<BeforeTicket | null> {
  return tx.workOrderTicket.findUnique({
    where: { id: ticketId },
    select: {
      summary: true,
      body: true,
      status: true,
      category: true,
      scheduledAt: true,
      assigneeId: true,
      assignee: { select: { id: true, name: true } },
      departments: {
        select: { id: true, name: true, color: true },
        orderBy: { name: "asc" },
      },
      descriptions: {
        select: { departmentId: true, body: true },
      },
    },
  });
}

/**
 * Compare `before` against the update `input` and write one activity row per
 * changed field. No-ops if nothing meaningfully changed.
 */
export async function recordUpdateActivities(
  tx: TransactionClient,
  ticketId: string,
  userId: string,
  before: BeforeTicket,
  input: UpdateInput,
): Promise<void> {
  // biome-ignore lint/suspicious/noExplicitAny: createMany rows are heterogeneous Json
  const rows: Array<{ type: string; data: any }> = [];

  if (input.summary !== undefined && input.summary !== before.summary) {
    rows.push({
      type: "SUMMARY_CHANGED",
      data: { from: before.summary, to: input.summary },
    });
  }
  if (
    input.body !== undefined &&
    (input.body ?? null) !== (before.body ?? null)
  ) {
    rows.push({
      type: "DESCRIPTION_CHANGED",
      data: { department: null, from: before.body, to: input.body ?? null },
    });
  }
  if (input.descriptions !== undefined) {
    const beforeMap = new Map(
      before.descriptions.map((d) => [d.departmentId, d.body]),
    );
    const afterMap = new Map(
      input.descriptions.map((d) => [d.departmentId, d.body]),
    );
    const changedDeptIds = new Set<string>();
    for (const [deptId, body] of afterMap) {
      if (beforeMap.get(deptId) !== body) changedDeptIds.add(deptId);
    }
    for (const [deptId] of beforeMap) {
      if (!afterMap.has(deptId)) changedDeptIds.add(deptId);
    }
    if (changedDeptIds.size > 0) {
      const depts = await tx.department.findMany({
        where: { id: { in: [...changedDeptIds] } },
        select: { id: true, name: true, color: true },
      });
      const deptById = new Map(depts.map((d) => [d.id, d]));
      for (const deptId of changedDeptIds) {
        const dept = deptById.get(deptId);
        if (!dept) continue;
        rows.push({
          type: "DESCRIPTION_CHANGED",
          data: {
            department: dept,
            from: beforeMap.get(deptId) ?? null,
            to: afterMap.get(deptId) ?? null,
          },
        });
      }
    }
  }
  if (input.status !== undefined && input.status !== before.status) {
    rows.push({
      type: "STATUS_CHANGED",
      data: { from: before.status, to: input.status },
    });
  }
  if (input.category !== undefined && input.category !== before.category) {
    rows.push({
      type: "CATEGORY_CHANGED",
      data: { from: before.category, to: input.category },
    });
  }
  if (
    input.scheduledAt !== undefined &&
    (input.scheduledAt?.getTime() ?? null) !==
      (before.scheduledAt?.getTime() ?? null)
  ) {
    rows.push({
      type: "SCHEDULED_AT_CHANGED",
      data: { from: before.scheduledAt, to: input.scheduledAt ?? null },
    });
  }
  if (
    input.assigneeId !== undefined &&
    (input.assigneeId ?? null) !== before.assigneeId
  ) {
    const toUser = input.assigneeId
      ? await tx.user.findUnique({
          where: { id: input.assigneeId },
          select: { id: true, name: true },
        })
      : null;
    rows.push({
      type: "ASSIGNEE_CHANGED",
      data: {
        from: before.assignee,
        to: toUser,
      },
    });
  }
  if (input.departmentIds !== undefined) {
    const beforeIds = new Set(before.departments.map((d) => d.id));
    const afterIds = new Set(input.departmentIds);
    const addedIds = input.departmentIds.filter((id) => !beforeIds.has(id));
    const removed = before.departments.filter((d) => !afterIds.has(d.id));
    const added =
      addedIds.length > 0
        ? await tx.department.findMany({
            where: { id: { in: addedIds } },
            select: { id: true, name: true, color: true },
          })
        : [];
    if (added.length > 0 || removed.length > 0) {
      rows.push({
        type: "DEPARTMENTS_CHANGED",
        data: { added, removed },
      });
    }
  }

  if (rows.length === 0) return;
  await tx.ticketActivity.createMany({
    data: rows.map((r) => ({
      ticketId,
      userId,
      type: r.type as
        | "STATUS_CHANGED"
        | "CATEGORY_CHANGED"
        | "ASSIGNEE_CHANGED"
        | "DEPARTMENTS_CHANGED"
        | "SCHEDULED_AT_CHANGED"
        | "SUMMARY_CHANGED"
        | "DESCRIPTION_CHANGED",
      data: r.data,
    })),
  });
}

/**
 * Records the WORK_ORDER_CREATED activity for a new ticket. Writes one row.
 * This function reads the creator, source, advisory, category, and priority
 * from the ticket, so the caller passes only the id. The activity belongs to
 * the ticket creator. For an automation-sourced ticket, the creator is the
 * integration user, and the UI shows an "AI Agent" badge. Call this function
 * after the external mappings and sources exist.
 */
export async function recordCreationActivity(ticketId: string): Promise<void> {
  const t = await prisma.workOrderTicket.findUnique({
    where: { id: ticketId },
    select: {
      creatorId: true,
      category: true,
      priority: true,
      sourceLabel: true,
      notification: { select: { title: true } },
      vulnerabilities: { select: { cveId: true }, take: 10 },
      externalMappings: {
        select: {
          externalId: true,
          integration: { select: { name: true } },
        },
        take: 1,
      },
    },
  });
  if (!t) return;

  const mapping = t.externalMappings[0];
  await prisma.ticketActivity.create({
    data: {
      ticketId,
      userId: t.creatorId,
      type: "WORK_ORDER_CREATED",
      data: {
        source: t.sourceLabel ?? mapping?.integration?.name ?? null,
        advisoryTitle: t.notification?.title ?? null,
        cveId: t.vulnerabilities.find((v) => v.cveId)?.cveId ?? null,
        externalRecordId: mapping?.externalId ?? null,
        category: t.category,
        priority: t.priority,
      },
    },
  });
}

export async function recordChildActivity(
  tx: TransactionClient,
  parentId: string,
  userId: string,
  childId: string,
  action: "attached" | "detached",
): Promise<void> {
  const child = await tx.workOrderTicket.findUnique({
    where: { id: childId },
    select: { id: true, summary: true },
  });
  await tx.ticketActivity.create({
    data: {
      ticketId: parentId,
      userId,
      type: action === "attached" ? "CHILD_ATTACHED" : "CHILD_DETACHED",
      data: { childId, childSummary: child?.summary ?? null },
    },
  });
}

export async function recordAssetActivity(
  tx: TransactionClient,
  ticketId: string,
  userId: string,
  assetId: string,
  action: "attached" | "detached",
  knownAsset?: { hostname: string | null; ip: string },
): Promise<void> {
  const asset =
    knownAsset ??
    (await tx.asset.findUnique({
      where: { id: assetId },
      select: { hostname: true, ip: true },
    }));
  await tx.ticketActivity.create({
    data: {
      ticketId,
      userId,
      type: action === "attached" ? "ASSET_ATTACHED" : "ASSET_DETACHED",
      data: {
        assetId,
        assetLabel: asset?.hostname ?? asset?.ip ?? null,
      },
    },
  });
}

export async function cascadeDoneStatus(
  tx: TransactionClient,
  ticketId: string,
  actorId: string,
): Promise<void> {
  const link = await tx.assetTicket.findUnique({
    where: { ticketId },
    select: {
      parentTicketId: true,
      parentTicket: {
        select: {
          status: true,
          assets: { select: { ticket: { select: { status: true } } } },
        },
      },
    },
  });
  if (!link || link.parentTicket.status === TicketStatus.DONE) return;

  const allDone = link.parentTicket.assets.every(
    (a) => a.ticket.status === TicketStatus.DONE,
  );
  if (!allDone) return;

  await tx.workOrderTicket.update({
    where: { id: link.parentTicketId },
    data: { status: TicketStatus.DONE },
  });
  await tx.ticketActivity.create({
    data: {
      ticketId: link.parentTicketId,
      userId: actorId,
      type: "STATUS_CHANGED",
      data: {
        from: link.parentTicket.status,
        to: TicketStatus.DONE,
        cause: "all-asset-tickets-done",
      },
    },
  });

  await cascadeDoneStatus(tx, link.parentTicketId, actorId);
}
