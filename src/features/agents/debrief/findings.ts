import "server-only";
import type { AIMessage, BaseMessage } from "@langchain/core/messages";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import {
  WORK_ORDER_LLM_OPEN_CHILD_LIMIT,
  workOrderLlmSelect,
} from "@/features/tracking/types";
import type { Prisma } from "@/generated/prisma";
import { AUTOMATION_USER_ID } from "@/lib/automation-user";
import prisma from "@/lib/db";
import { createAgentCaller } from "@/trpc/agent-caller";

export const RECORD_FINDING_TOOL = "record_finding";

/** Main entities: each has a work-order lookup. */
const FINDING_ENTITIES = [
  "notification",
  "vulnerability",
  "asset",
  "workOrder",
] as const;

const RELATED_ENTITIES = [...FINDING_ENTITIES, "remediation"] as const;
type RelatedEntity = (typeof RELATED_ENTITIES)[number];

const MAX_RELATED = 5;

/** Work-order rows shown per finding. The rest are counted, not listed. */
export const WORK_ORDERS_PER_FINDING = 5;

export const findingSchema = z.object({
  entityType: z
    .enum(FINDING_ENTITIES)
    .describe("The kind of record this finding is about."),
  entityId: z
    .string()
    .describe("That record's id, exactly as it appeared in retrieved data."),
  summary: z
    .string()
    .describe("What it is, in one sentence a nurse manager would understand."),
  whyItMatters: z.string().describe("Why it matters today."),
  relatedEntities: z
    .array(
      z.object({
        entityType: z.enum(RELATED_ENTITIES),
        entityId: z.string(),
      }),
    )
    .max(MAX_RELATED)
    .optional()
    .describe(
      "Other records the reader can open, such as the vulnerability, the affected assets, or a remediation.",
    ),
});

export type Finding = z.infer<typeof findingSchema>;

export const recordFindingTool = tool(async () => "Recorded.", {
  name: RECORD_FINDING_TOOL,
  description:
    "Record one finding for today's debrief. Call once per finding. The platform attaches the finding's work orders from the database.",
  schema: findingSchema,
});

/**
 * The findings the scout recorded, in call order. A repeated entity keeps its
 * first finding, and a call whose arguments fail the schema is skipped.
 */
export function extractFindings(messages: BaseMessage[]): Finding[] {
  const seen = new Set<string>();
  const findings: Finding[] = [];
  for (const message of messages) {
    for (const call of (message as AIMessage).tool_calls ?? []) {
      if (call.name !== RECORD_FINDING_TOOL) continue;
      const parsed = findingSchema.safeParse(call.args);
      if (!parsed.success) continue;
      const key = `${parsed.data.entityType}:${parsed.data.entityId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      findings.push(parsed.data);
    }
  }
  return findings;
}

type LabelRow = { id: string; label: string | null };

const LABEL_LOOKUP: Record<
  RelatedEntity,
  (ids: string[]) => Promise<LabelRow[]>
> = {
  notification: async (ids) =>
    (
      await prisma.notification.findMany({
        where: { id: { in: ids } },
        select: { id: true, title: true },
      })
    ).map((r) => ({ id: r.id, label: r.title })),
  vulnerability: async (ids) =>
    (
      await prisma.vulnerability.findMany({
        where: { id: { in: ids } },
        select: { id: true, cveId: true },
      })
    ).map((r) => ({ id: r.id, label: r.cveId })),
  asset: async (ids) =>
    (
      await prisma.asset.findMany({
        where: { id: { in: ids } },
        select: { id: true, hostname: true },
      })
    ).map((r) => ({ id: r.id, label: r.hostname })),
  workOrder: async (ids) =>
    (
      await prisma.workOrderTicket.findMany({
        where: { id: { in: ids } },
        select: { id: true, summary: true },
      })
    ).map((r) => ({ id: r.id, label: r.summary })),
  remediation: async (ids) =>
    (
      await prisma.remediation.findMany({
        where: { id: { in: ids } },
        select: { id: true, description: true },
      })
    ).map((r) => ({ id: r.id, label: r.description })),
};

const entityKey = (entityType: string, entityId: string) =>
  `${entityType}:${entityId}`;

/** Label of every referenced record that exists, keyed "type:id". One query per type. */
async function loadLabels(
  findings: Finding[],
): Promise<Map<string, string | null>> {
  const wanted = new Map<RelatedEntity, Set<string>>();
  const want = (entityType: RelatedEntity, entityId: string) => {
    const ids = wanted.get(entityType) ?? new Set<string>();
    ids.add(entityId);
    wanted.set(entityType, ids);
  };
  for (const finding of findings) {
    want(finding.entityType, finding.entityId);
    for (const related of finding.relatedEntities ?? [])
      want(related.entityType, related.entityId);
  }

  const labels = new Map<string, string | null>();
  await Promise.all(
    [...wanted].map(async ([entityType, ids]) => {
      for (const row of await LABEL_LOOKUP[entityType]([...ids]))
        labels.set(entityKey(entityType, row.id), row.label);
    }),
  );
  return labels;
}

export type WorkOrderRow = Prisma.WorkOrderTicketGetPayload<{
  select: typeof workOrderLlmSelect;
}> & { relation?: "direct" | "sharedVulnerability" };

export type WorkOrderBlock = { rows: WorkOrderRow[]; totalCount: number };

async function loadWorkOrders(finding: Finding): Promise<WorkOrderBlock> {
  const id = finding.entityId;
  if (finding.entityType === "workOrder") {
    const row = await prisma.workOrderTicket.findUnique({
      where: { id },
      select: workOrderLlmSelect,
    });
    return { rows: row ? [row] : [], totalCount: row ? 1 : 0 };
  }
  // The router owns the matching rules, including the shared-vulnerability
  // path for notifications, so the lookup goes through it.
  const filter = {
    notification: { notificationId: id },
    vulnerability: { vulnerabilityId: id },
    asset: { assetId: id },
  }[finding.entityType];
  const page = await createAgentCaller(
    AUTOMATION_USER_ID,
  ).tracking.getManyForLlm({ ...filter, pageSize: WORK_ORDERS_PER_FINDING });
  return { rows: page.items, totalCount: page.totalCount };
}

export type EnrichedFinding = Finding & {
  label: string | null;
  related: {
    entityType: RelatedEntity;
    entityId: string;
    label: string | null;
  }[];
  workOrders: WorkOrderBlock;
};

/**
 * Check every id against the database and attach each finding's work orders.
 * A finding whose own record does not exist is dropped, and so is a related
 * record that does not exist, so an invented id never reaches the writer.
 */
export async function enrichFindings(
  findings: Finding[],
): Promise<EnrichedFinding[]> {
  const labels = await loadLabels(findings);
  const real = findings.filter((f) =>
    labels.has(entityKey(f.entityType, f.entityId)),
  );
  return Promise.all(
    real.map(async (finding) => ({
      ...finding,
      label:
        labels.get(entityKey(finding.entityType, finding.entityId)) ?? null,
      related: (finding.relatedEntities ?? [])
        .filter((r) => labels.has(entityKey(r.entityType, r.entityId)))
        .map((r) => ({
          ...r,
          label: labels.get(entityKey(r.entityType, r.entityId)) ?? null,
        })),
      workOrders: await loadWorkOrders(finding),
    })),
  );
}

const describeRecord = (
  entityType: string,
  entityId: string,
  label: string | null,
) => `${entityType} ${entityId}${label ? ` ("${label}")` : ""}`;

function renderWorkOrder(row: WorkOrderRow): string[] {
  const departments =
    row.departments.map((d) => d.name).join(", ") || "no department";
  const relation =
    row.relation === "sharedVulnerability"
      ? " — related work (shares a vulnerability), not filed for this item"
      : "";
  const lines = [
    `  - workOrder ${row.id} — "${row.summary}" — ${row.status} — ${departments}${relation}`,
  ];

  const total = row._count.children;
  if (total > 0) {
    const open = row.children;
    const capped = open.length === WORK_ORDER_LLM_OPEN_CHILD_LIMIT ? "+" : "";
    const list = open.length
      ? open.map((c) => `"${c.summary}" ${c.status}`).join("; ")
      : "none";
    lines.push(
      `    Open sub-tickets (${open.length}${capped} of ${total}): ${list}`,
    );
  }
  return lines;
}

/** The findings as the writer reads them. Pure, so it is golden-tested. */
export function renderFindings(findings: EnrichedFinding[]): string {
  return findings
    .map((finding, index) => {
      const lines = [
        `Finding ${index + 1}: ${finding.summary}`,
        `- Record: ${describeRecord(finding.entityType, finding.entityId, finding.label)}`,
        `- Why it matters: ${finding.whyItMatters}`,
      ];
      if (finding.related.length > 0) {
        const related = finding.related
          .map((r) => describeRecord(r.entityType, r.entityId, r.label))
          .join("; ");
        lines.push(`- Related: ${related}`);
      }

      const { rows, totalCount } = finding.workOrders;
      if (rows.length === 0) {
        lines.push("- Work orders: none open");
      } else {
        lines.push(`- Work orders (${totalCount}):`);
        // A sub-ticket is also a row of its own. Show it once, under its parent.
        const shownAsChild = new Set(
          rows.flatMap((row) => row.children.map((child) => child.id)),
        );
        for (const row of rows)
          if (!shownAsChild.has(row.id)) lines.push(...renderWorkOrder(row));
        if (totalCount > rows.length)
          lines.push(`  - and ${totalCount - rows.length} more`);
      }
      return lines.join("\n");
    })
    .join("\n\n");
}
