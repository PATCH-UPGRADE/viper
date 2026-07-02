// VEX sorting agent deterministic apply: turns the agent's structured output
// into deterministic write ops and applies them to the database.

import "server-only";
import type { ConfidenceLevel, IssueStatus } from "@/generated/prisma";
import prisma from "@/lib/db";
import type { VexContext } from "./context";
import type {
  StatusValue,
  VexNotAffectedJustification,
  VexResult,
} from "./tools";

export type VexApplySummary = { updated: number; created: number };

type IssueUpdateOp = {
  issueId: string;
  status: IssueStatus;
  justification: VexNotAffectedJustification | null;
  confidence: ConfidenceLevel;
  notes: string;
};
type AssetOverrideOp = {
  assetId: string;
  vulnerabilityId: string;
  status: IssueStatus;
  justification: VexNotAffectedJustification | null;
  confidence: ConfidenceLevel;
  notes: string;
};

/** Normalize a status value, dropping NOT_AFFECTED without a justification. */
function normalizeStatus(status: StatusValue | undefined): {
  status: IssueStatus;
  justification: VexNotAffectedJustification | null;
} | null {
  if (!status?.status) return null;
  if (status.status === "NOT_AFFECTED") {
    if (!status.justification) return null;
    return { status: "NOT_AFFECTED", justification: status.justification };
  }
  return { status: status.status, justification: null };
}

/**
 * Turn an agent VexResult into deterministic write ops. Pure + guarded (no DB):
 * skips ids that aren't baseline issues in context (hallucinations), skips
 * NOT_AFFECTED without a justification, and skips asset overrides whose id isn't
 * reachable through the issue. Unit-tested in isolation.
 */
export function planVexWrites(
  context: VexContext,
  result: VexResult,
): { issueUpdates: IssueUpdateOp[]; assetOverrides: AssetOverrideOp[] } {
  const issuesById = new Map(context.issues.map((i) => [i.issueId, i]));
  const issueUpdates: IssueUpdateOp[] = [];
  const assetOverrides: AssetOverrideOp[] = [];

  for (const [issueId, value] of Object.entries(result)) {
    const ctx = issuesById.get(issueId);
    if (!ctx || !value) continue; // hallucinated id or no-change

    const confidence: ConfidenceLevel =
      value.confidence === "Matched" ? "Matched" : "NeedsReview";

    // Group-level update only when a status was supplied. A determination may
    // carry only asset overrides, leaving the device-group issue untouched.
    const norm = normalizeStatus(value.status);
    if (norm) {
      issueUpdates.push({
        issueId,
        status: norm.status,
        justification: norm.justification,
        confidence,
        notes: value.reasonWhy ?? "",
      });
    }

    for (const override of value.assets ?? []) {
      if (!ctx.assetIds.includes(override.id)) continue; // out-of-scope asset
      const aNorm = normalizeStatus(override.status);
      if (!aNorm) continue;
      assetOverrides.push({
        assetId: override.id,
        vulnerabilityId: ctx.vulnerabilityId,
        status: aNorm.status,
        justification: aNorm.justification,
        confidence,
        notes: override.reasonWhy ?? "",
      });
    }
  }

  return { issueUpdates, assetOverrides };
}

/** Apply planned VEX writes to the database in a single transaction. */
export async function applyVexDeterminations(
  context: VexContext,
  result: VexResult,
): Promise<VexApplySummary> {
  const { issueUpdates, assetOverrides } = planVexWrites(context, result);

  await prisma.$transaction(async (tx) => {
    for (const op of issueUpdates) {
      await tx.issue.update({
        where: { id: op.issueId },
        data: {
          status: op.status,
          notAffectedJustification: op.justification,
          statusConfidence: op.confidence,
          statusNotes: op.notes,
        },
      });
    }

    for (const op of assetOverrides) {
      await tx.issue.upsert({
        where: {
          assetId_vulnerabilityId: {
            assetId: op.assetId,
            vulnerabilityId: op.vulnerabilityId,
          },
        },
        create: {
          assetId: op.assetId,
          vulnerabilityId: op.vulnerabilityId,
          status: op.status,
          notAffectedJustification: op.justification,
          statusConfidence: op.confidence,
          statusNotes: op.notes,
        },
        update: {
          status: op.status,
          notAffectedJustification: op.justification,
          statusConfidence: op.confidence,
          statusNotes: op.notes,
        },
      });
    }
  });

  return { updated: issueUpdates.length, created: assetOverrides.length };
}
