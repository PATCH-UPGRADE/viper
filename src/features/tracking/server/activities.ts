import "server-only";
import type { TicketCategory, TicketStatus } from "@/generated/prisma";
import type { TransactionClient } from "@/lib/db";

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
): Promise<void> {
  const asset = await tx.asset.findUnique({
    where: { id: assetId },
    select: { id: true, hostname: true, ip: true },
  });
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
