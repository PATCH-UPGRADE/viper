// LLM compares extracted potential db items (eg, device group) with potential
// VIPER matches and makes decisions to link them to the notification/update a
// db item/create a new one

import "server-only";
import { ChatAnthropic } from "@langchain/anthropic";
import { z } from "zod";
import type { ConfidenceLevel } from "@/generated/prisma";
import prisma from "@/lib/db";
import { cpeToDeviceGroup } from "@/lib/router-utils";
import type { Candidates } from "./candidate-search";
import type { ExtractResult } from "./extract";

const MODEL = "claude-haiku-4-5-20251001";

// Fields the LLM may set when creating/updating a device group. Kept flat and
// optional so the schema stays a top-level object (Anthropic requirement).
const deviceGroupFieldsSchema = z.object({
  cpe: z.string().nullish(),
  manufacturer: z.string().nullish(),
  modelName: z.string().nullish(),
  version: z.string().nullish(),
});

const decisionSchema = z.object({
  kind: z.enum(["deviceGroup"]), // TODO: add vulnerability, remediation, maybe asset...
  op: z.enum(["link", "update", "create"]),
  // The id of an existing candidate to link/update. Omitted for create.
  targetId: z.string().nullish(),
  // The LLM may only express these two — Confirmed is reserved for humans.
  confidence: z.enum(["NeedsReview", "Matched"]),
  reasonWhy: z.string(),
  fields: deviceGroupFieldsSchema.nullish(),
});

const matchSchema = z.object({
  decisions: z.array(decisionSchema).default([]),
});

export type Decision = z.infer<typeof decisionSchema>;

// A device-group mapping belongs to exactly one parent — a Notification or a
// WorkOrderTicket. Callers pick which by passing the matching key.
export type MatchOwner =
  | { notificationId: string }
  | { workOrderTicketId: string };

export type MatchSummary = {
  linked: number;
  updated: number;
  created: number;
  skipped: number;
};

const SYSTEM_PROMPT = `You are a matching agent for a hospital cybersecurity platform. You connect the DEVICE GROUPS referenced in a security notification to records in the database.

You are given, for each device group extracted from the notification, a list of candidate database records found by identifier search.

For each extracted device group, choose exactly ONE action:
- "link": the device group clearly matches an existing candidate. Set targetId to that candidate's id.
- "update": the device group matches an existing candidate, but the notification contains additional/missing identifier info worth saving (e.g. a version the record lacks). Set targetId to that candidate's id and put the new values in fields.
- "create": none of the candidates match. Put the device group's identifiers in fields. A cpe is required to create — if you cannot supply one, prefer "link" to the closest candidate or omit the decision entirely.

CONFIDENCE (you may only use these two):
- "Matched": strong identifier match (same CPE, or same manufacturer + model).
- "NeedsReview": plausible but uncertain match, or a newly created record that a human should verify.

Always give a concise reasonWhy explaining the match. Only emit decisions you are reasonably confident about; it is fine to return fewer decisions than device groups.`;

function renderCandidates(candidates: Candidates): string {
  if (candidates.deviceGroups.length === 0)
    return "(no device groups extracted)";

  return candidates.deviceGroups
    .map((entry, i) => {
      const e = entry.extracted;
      const extractedLine = `Device group #${i + 1} extracted: cpe=${e.cpe ?? "?"} | manufacturer=${e.manufacturer ?? "?"} | modelName=${e.modelName ?? "?"} | version=${e.version ?? "?"}`;
      const matches =
        entry.matches.length > 0
          ? entry.matches
              .map(
                (m) =>
                  `    - id: ${m.id} | cpe: ${m.cpe.join(", ") || "(none)"} | manufacturer: ${m.manufacturer ?? "(none)"} | modelName: ${m.modelName ?? "(none)"} | version: ${m.version ?? "(none)"}`,
              )
              .join("\n")
          : "    - (no candidates found)";
      return `${extractedLine}\n  Candidates:\n${matches}`;
    })
    .join("\n\n");
}

// Build a Prisma data object from LLM-provided fields, dropping empties.
function cleanFields(fields: Decision["fields"]): {
  cpe?: string;
  manufacturer?: string;
  modelName?: string;
  version?: string;
} {
  const out: Record<string, string> = {};
  if (!fields) return out;
  for (const key of ["cpe", "manufacturer", "modelName", "version"] as const) {
    const val = fields[key];
    if (typeof val === "string" && val.trim().length > 0) out[key] = val.trim();
  }
  return out;
}

export async function matchAndLinkEntities(
  owner: MatchOwner,
  extracted: ExtractResult,
  candidates: Candidates,
): Promise<MatchSummary> {
  if (Object.values(extracted).every((v) => v.length === 0)) {
    return { linked: 0, updated: 0, created: 0, skipped: 0 };
  }

  const model = new ChatAnthropic({
    model: MODEL,
    maxTokens: 2048,
  }).withStructuredOutput(matchSchema);

  const { decisions = [] } = await model.invoke([
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: renderCandidates(candidates) },
  ]);

  return applyDecisions(owner, decisions, candidates);
}

/**
 * Deterministically apply a list of matching decisions to the database.
 * Separated from the LLM call so it can be unit-tested in isolation.
 *
 * Idempotent: mappings are upserted on (owner, deviceGroupId) and new device
 * groups are resolved to their canonical (vendor/product/version) identity via
 * resolveDeviceGroup, so replaying does not duplicate rows.
 */
export async function applyDecisions(
  owner: MatchOwner,
  decisions: Decision[],
  candidates: Candidates,
): Promise<MatchSummary> {
  const summary: MatchSummary = {
    linked: 0,
    updated: 0,
    created: 0,
    skipped: 0,
  };

  // Only allow link/update against ids the search actually surfaced — guards
  // against hallucinated targetIds causing FK errors.
  const validIds = new Set(
    candidates.deviceGroups.flatMap((e) => e.matches.map((m) => m.id)),
  );

  await prisma.$transaction(async (tx) => {
    for (const decision of decisions) {
      if (decision.kind !== "deviceGroup") {
        summary.skipped++;
        continue;
      }

      // Hard guard: the pipeline never writes Confirmed.
      const confidence: ConfidenceLevel =
        decision.confidence === "Matched" ? "Matched" : "NeedsReview";

      const upsertMapping = (deviceGroupId: string) =>
        "notificationId" in owner
          ? tx.notificationDeviceGroupMapping.upsert({
              where: {
                notificationId_deviceGroupId: {
                  notificationId: owner.notificationId,
                  deviceGroupId,
                },
              },
              create: {
                notificationId: owner.notificationId,
                deviceGroupId,
                confidence,
                reasonWhy: decision.reasonWhy,
              },
              update: { confidence, reasonWhy: decision.reasonWhy },
            })
          : tx.notificationDeviceGroupMapping.upsert({
              where: {
                workOrderTicketId_deviceGroupId: {
                  workOrderTicketId: owner.workOrderTicketId,
                  deviceGroupId,
                },
              },
              create: {
                workOrderTicketId: owner.workOrderTicketId,
                deviceGroupId,
                confidence,
                reasonWhy: decision.reasonWhy,
              },
              update: { confidence, reasonWhy: decision.reasonWhy },
            });

      // link the device group to the notification
      if (decision.op === "link") {
        if (!decision.targetId || !validIds.has(decision.targetId)) {
          summary.skipped++;
          continue;
        }
        await upsertMapping(decision.targetId);
        summary.linked++;
      }
      // update the device group and link it to the notification
      // TODO: consider, we may want to separate this into 'update' and 'update_and_link' actions
      else if (decision.op === "update") {
        if (!decision.targetId || !validIds.has(decision.targetId)) {
          summary.skipped++;
          continue;
        }
        // Vendor/product/version are part of a device group's identity now and
        // can't be mutated in place; the only safe enrichment is unioning a new
        // CPE into the existing group's cpe[] array.
        const data = cleanFields(decision.fields);
        if (data.cpe) {
          const group = await tx.deviceGroup.findUnique({
            where: { id: decision.targetId },
            select: { cpe: true },
          });
          if (group && !group.cpe.includes(data.cpe)) {
            await tx.deviceGroup.update({
              where: { id: decision.targetId },
              data: { cpe: { push: data.cpe } },
            });
          }
        }
        await upsertMapping(decision.targetId);
        summary.updated++;
      } else {
        // create
        const data = cleanFields(decision.fields);
        const cpe = data.cpe;
        if (!cpe) {
          summary.skipped++;
          continue;
        }
        // The CPE is required and authoritative: cpeToDeviceGroup parses it into
        // canonical vendor/product/version, sets versionStatus, attaches the CPE
        // to cpe[], and find-or-creates by identity (race-safe, idempotent).
        const created = await cpeToDeviceGroup(cpe);
        await upsertMapping(created.id);
        summary.created++;
      }
    }
  });

  return summary;
}
