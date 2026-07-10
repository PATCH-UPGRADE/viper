// LLM compares extracted potential db items (eg, device group) with potential
// VIPER matches and makes decisions to link them to the notification/update a
// db item/create a new one

import "server-only";
import { ChatAnthropic } from "@langchain/anthropic";
import { z } from "zod";
import type { ConfidenceLevel } from "@/generated/prisma";
import prisma from "@/lib/db";
import { resolveMatchingId } from "@/lib/router-utils";
import {
  addProductAlias,
  addVendorAlias,
  enrichAssetIdentifiers,
  enrichDeviceGroupIdentifiers,
  enrichVulnerabilityCvss,
} from "../utils";
import type { Candidates } from "./candidate-search";
import type { ExtractResult } from "./extract";

const MODEL = "claude-haiku-4-5-20251001";

// Fields the LLM may set when creating/updating a device group. Kept flat and
// optional so the schema stays a top-level object (Anthropic requirement).
const detailsFieldsSchema = z.object({
  cpe: z.string().nullish(),
  udi: z.string().nullish(),
  manufacturer: z.string().nullish(),
  modelName: z.string().nullish(),
  version: z.string().nullish(),
  versionRange: z.string().nullish(),
  cveId: z
    .string()
    .regex(/^CVE-\d{4}-\d{4,}$/i)
    .nullish(),
  linkedCveId: z
    .string()
    .regex(/^CVE-\d{4}-\d{4,}$/i)
    .nullish(),
  description: z.string().nullish(),
  cvssScore: z.number().min(0).max(10).nullish(),
  cvssVector: z.string().nullish(),
  macAddress: z.string().nullish(),
  serialNumber: z.string().nullish(),
});

const decisionSchema = z.object({
  kind: z.enum([
    "deviceGroupMatching",
    "vulnerability",
    "remediation",
    "asset",
  ]),
  op: z.enum(["link", "update", "create"]),
  // The id of an existing candidate to link/update. Omitted for create.
  targetId: z.string().nullish(),
  // The LLM may only express these two — Confirmed is reserved for humans.
  confidence: z.enum(["NeedsReview", "Matched"]),
  reasonWhy: z.string(),
  fields: detailsFieldsSchema.nullish(),
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

const SYSTEM_PROMPT = `You are a matching agent for a hospital cybersecurity platform. You connect entities referenced in a security notification to records in the database.

You are given, for each entity extracted from the notification, a list of candidate database records found by identifier search.

For each extracted device group, choose exactly ONE action:
- "link": the device group clearly matches an existing candidate. Set targetId to that candidate's id.
- "update": the device group matches an existing candidate, but the notification contains additional/missing identifier info worth saving (e.g. a versionRange the record lacks). Set targetId to that candidate's id and put the new values in fields.
- "create": none of the candidates match. Put the device group's identifiers in fields. Manufacturer is required to create — if you cannot supply one, prefer "link" to the closest candidate or omit the decision entirely.

For each extracted Vulnerability, choose exactly ONE action:
- "link": the vulnerability clearly matches an existing candidate (same CVE id). Set targetId to that candidate's id.
- "update": matches an existing candidate, but the notification has new info worth saving (cvssScore, cvssVector, description). Set targetId and put the new values in fields.

For each extracted Remediation, choose exactly ONE action:
- "link": the remediation clearly matches an existing candidate. Set targetId to that candidate's id.
- "update": matches an existing candidate, but the notification has new info worth saving (description) Set targetId and put the new value in fields.

For each extracted Asset, choose exactly ONE action:
- "link": the asset clearly matches an existing candidate (same IP/hostname/Mac Address/serial number). Set targetId to that candidate's id. If the notification states a MAC address or serial number the matched record is missing, include it in fields so it can be saved.

CONFIDENCE (you may only use these two):
- "Matched": strong identifier match (same CVE id, same IP/hostname/MAC address/serial number, or same manufacturer + model).
- "NeedsReview": plausible but uncertain match, or a newly created record that a human should verify.

Always give a concise reasonWhy explaining the match. Only emit decisions you are reasonably confident about; it is fine to return fewer decisions than extracted entities.`;

function renderCandidates(candidates: Candidates): string {
  const sections: string[] = [];

  if (
    candidates.deviceGroups.length === 0 &&
    candidates.vulnerabilities.length === 0 &&
    candidates.remediations.length === 0 &&
    candidates.assets.length === 0
  ) {
    return "(no entities extracted)";
  }

  if (candidates.deviceGroups.length > 0) {
    sections.push(
      candidates.deviceGroups
        .map((entry, i) => {
          const e = entry.extracted;
          const extractedLine = `Device group #${i + 1} extracted: cpe=${e.cpe ?? "?"} | manufacturer=${e.manufacturer ?? "?"} | modelName=${e.modelName ?? "?"} | version=${e.version ?? "?"} | versionRange=${e.versionRange ?? "?"}`;
          const matches =
            entry.matches.length > 0
              ? entry.matches
                  .map(
                    (m) =>
                      `    - id: ${m.id} | manufacturer: ${m.manufacturer ?? "(none)"} | modelName: ${m.modelName ?? "(none)"} | version: ${m.version ?? "(none)"}`,
                  )
                  .join("\n")
              : "    - (no candidates found)";
          return `${extractedLine}\n  Candidates:\n${matches}`;
        })
        .join("\n\n"),
    );
  }

  if (candidates.vulnerabilities.length > 0) {
    sections.push(
      "\n" +
        candidates.vulnerabilities
          .map((entry, i) => {
            const e = entry.extracted;
            const line = `Vulnerability #${i + 1} extracted: cveId=${e.cveId ?? "?"} | cvssScore: ${e.cvssScore ?? "?"} | cvssVector: ${e.cvssVector ?? "?"}`;
            const matches =
              entry.matches.length > 0
                ? entry.matches
                    .map(
                      (m) =>
                        ` - id: ${m.id} | cveId: ${m.cveId ?? "(none)"} | cvssScore: ${m.cvssScore ?? "(none)"} | cvssVector: ${m.cvssVector ?? "(none)"}`,
                    )
                    .join("\n")
                : "    - (no candidates found)";

            return `${line}\n Candidates: \n${matches}`;
          })
          .join("\n\n"),
    );
  }

  if (candidates.remediations.length > 0) {
    sections.push(
      "\n" +
        candidates.remediations
          .map((entry, i) => {
            const e = entry.extracted;
            const line = `Remediations #${i + 1} extracted: linkedtoCveId=${e.linkedCveId ?? "?"} | description=${e.description ?? "?"}`;
            const matches =
              entry.matches.length > 0
                ? entry.matches
                    .map(
                      (m) =>
                        ` - id: ${m.id} | linkedtoCveId: ${m.linkedCveId ?? "(none)"} | description: ${m.description ?? "(none)"}`,
                    )
                    .join("\n")
                : "    - (no candidates found)";

            return `${line}\n Candidates: \n${matches}`;
          })
          .join("\n\n"),
    );
  }

  if (candidates.assets.length > 0) {
    sections.push(
      "\n" +
        candidates.assets
          .map((entry, i) => {
            const e = entry.extracted;
            const line = `Asset #${i + 1} extracted: ip=${e.ip ?? "?"} | hostname=${e.hostname ?? "?"} | macAddress=${e.macAddress ?? "?"} | serialNumber=${e.serialNumber ?? "?"}`;
            const matches =
              entry.matches.length > 0
                ? entry.matches
                    .map(
                      (m) =>
                        ` - id: ${m.id} | ip: ${m.ip ?? "(none)"} | hostname: ${m.hostname ?? "(none)"} | macAddress: ${m.macAddress ?? "(none)"} | serialNumber=${m.serialNumber ?? "(none)"}`,
                    )
                    .join("\n")
                : "    - (no candidates found)";

            return `${line}\n Candidates: \n${matches}`;
          })
          .join("\n\n"),
    );
  }

  return sections.length > 0
    ? sections.join("\n\n")
    : "(No Match Record Found)";
}

// Build a Prisma data object from LLM-provided fields, dropping empties.
function cleanFields(fields: Decision["fields"]): {
  manufacturer?: string;
  modelName?: string;
  version?: string;
  versionRange?: string;
  cpe?: string;
  udi?: string;
  cveId?: string;
  description?: string;
  linkedCveId?: string;
  cvssScore?: number;
  cvssVector?: string;
  macAddress?: string;
  serialNumber?: string;
} {
  const out: Record<string, string | number> = {};
  if (!fields) return out;
  for (const key of [
    "manufacturer",
    "modelName",
    "version",
    "versionRange",
    "cveId",
    "linkedCveId",
    "cpe",
    "udi",
    "description",
    "cvssScore",
    "cvssVector",
    "macAddress",
    "serialNumber",
  ] as const) {
    const val = fields[key];
    if (typeof val === "string" && val.trim().length > 0) out[key] = val.trim();
  }
  if (typeof fields.cvssScore === "number") out.cvssScore = fields.cvssScore;
  if (
    typeof fields.cvssVector === "string" &&
    fields.cvssVector.trim().length > 0
  ) {
    out.cvssVector = fields.cvssVector.trim();
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

  // Pull rejectedDeviceGroupMatching ids
  const rejectedDeviceGroupMatchingIds = new Set(
    (
      await prisma.notificationDeviceGroupMapping.findMany({
        where: { notificationId, confidence: "Rejected" },
        select: { deviceGroupMatchingId: true },
      })
    ).map((m) => m.deviceGroupMatchingId),
  );

  // Only allow link/update against ids the search actually surfaced — guards
  // against hallucinated targetIds causing FK errors.

  const validIds = {
    deviceGroupMatching: new Set(
      candidates.deviceGroups
        .flatMap((e) => e.matches.map((m) => m.id))
        .filter((id) => !rejectedDeviceGroupMatchingIds.has(id)),
    ),
    vulnerability: new Set(
      candidates.vulnerabilities.flatMap((e) => e.matches.map((m) => m.id)),
    ),
    remediation: new Set(
      candidates.remediations.flatMap((e) => e.matches.map((m) => m.id)),
    ),
    asset: new Set(
      candidates.assets.flatMap((e) => e.matches.map((m) => m.id)),
    ),
  };

  await prisma.$transaction(async (tx) => {
    for (const decision of decisions) {
      // Hard guard: the pipeline never writes Confirmed.
      const confidence: ConfidenceLevel =
        decision.confidence === "Matched" ? "Matched" : "NeedsReview";

      if (decision.kind === "deviceGroupMatching") {
        // A device-group mapping is the only link kind a WorkOrderTicket can
        // own; Notifications additionally own vulnerability/remediation/asset
        // mappings (handled below). Pick the matching compound key from `owner`.
        const upsertMapping = (deviceGroupMatchingId: string) =>
          "notificationId" in owner
            ? tx.notificationDeviceGroupMapping.upsert({
                where: {
                  notificationId_deviceGroupMatchingId: {
                    notificationId: owner.notificationId,
                    deviceGroupMatchingId,
                  },
                },
                create: {
                  notificationId: owner.notificationId,
                  deviceGroupMatchingId,
                  confidence,
                  reasonWhy: decision.reasonWhy,
                },
                update: { confidence, reasonWhy: decision.reasonWhy },
              })
            : tx.notificationDeviceGroupMapping.upsert({
                where: {
                  workOrderTicketId_deviceGroupMatchingId: {
                    workOrderTicketId: owner.workOrderTicketId,
                    deviceGroupMatchingId,
                  },
                },
                create: {
                  workOrderTicketId: owner.workOrderTicketId,
                  deviceGroupMatchingId,
                  confidence,
                  reasonWhy: decision.reasonWhy,
                },
                update: { confidence, reasonWhy: decision.reasonWhy },
              });

        const enrichDeviceGroup = async (
          deviceGroupMatchingId: string,
          data: ReturnType<typeof cleanFields>,
        ) => {
          if (!data.cpe && !data.udi) return;
          const matching = await tx.deviceGroupMatching.findUnique({
            where: { id: deviceGroupMatchingId },
            select: { vendorId: true, productId: true, versionId: true },
          });
          if (matching) {
            await enrichDeviceGroupIdentifiers(matching, {
              cpe: data.cpe,
              udi: data.udi,
            });
          }
        };

        // link the device group to the notification
        if (decision.op === "link") {
          if (
            !decision.targetId ||
            !validIds.deviceGroupMatching.has(decision.targetId)
          ) {
            summary.skipped++;
            continue;
          }
          await upsertMapping(decision.targetId);
          await enrichDeviceGroup(
            decision.targetId,
            cleanFields(decision.fields),
          );
          summary.linked++;
        }
        // update the device group and link it to the notification
        // TODO: consider, we may want to separate this into 'update' and 'update_and_link' actions
        else if (decision.op === "update") {
          if (
            !decision.targetId ||
            !validIds.deviceGroupMatching.has(decision.targetId)
          ) {
            summary.skipped++;
            continue;
          }
          // Vendor/product/version are part of a device group's identity now and
          // can't be mutated in place; the only safe enrichment is unioning a new
          // CPE into the existing group's cpe[] array.
          const data = cleanFields(decision.fields);

          const targetMatching = await tx.deviceGroupMatching.findUnique({
            where: { id: decision.targetId },
            select: {
              versionRange: true,
              vendorId: true,
              productId: true,
              versionId: true,
            },
          });

          if (
            data.versionRange &&
            targetMatching &&
            !targetMatching.versionRange
          ) {
            await tx.deviceGroupMatching.update({
              where: { id: decision.targetId },
              data: { versionRange: data.versionRange },
            });
          }
          if (targetMatching) {
            if (data.manufacturer) {
              await addVendorAlias(targetMatching.vendorId, data.manufacturer);
            }
            if (data.modelName && targetMatching.productId) {
              await addProductAlias(targetMatching.productId, data.modelName);
            }
          }
          await upsertMapping(decision.targetId);
          await enrichDeviceGroup(decision.targetId, data);
          summary.updated++;
        } else {
          // create
          const data = cleanFields(decision.fields);
          if (!data.manufacturer) {
            summary.skipped++;
            continue;
          }
          const matchingId = await resolveMatchingId({
            vendor: data.manufacturer,
            product: data.modelName,
            version: data.version,
            versionRange: data.versionRange,
            hasCpe: false,
          });

          if (rejectedDeviceGroupMatchingIds.has(matchingId)) {
            summary.skipped++;
            continue;
          }

          await upsertMapping(matchingId);
          await enrichDeviceGroup(matchingId, data);
          summary.created++;
        }
      } else if (decision.kind === "vulnerability") {
        // Vulnerability/remediation/asset mappings exist only for
        // Notifications — a WorkOrderTicket owns device-group links only.
        if (!("notificationId" in owner)) {
          summary.skipped++;
          continue;
        }
        if (
          !decision.targetId ||
          !validIds.vulnerability.has(decision.targetId)
        ) {
          summary.skipped++;
          continue;
        }
        await tx.notificationVulnerabilityMapping.upsert({
          where: {
            notificationId_vulnerabilityId: {
              notificationId: owner.notificationId,
              vulnerabilityId: decision.targetId,
            },
          },
          create: {
            notificationId: owner.notificationId,
            vulnerabilityId: decision.targetId,
            confidence,
            reasonWhy: decision.reasonWhy,
          },
          update: { confidence, reasonWhy: decision.reasonWhy },
        });
        const data = cleanFields(decision.fields);
        if (decision.op === "update" && data.description) {
          await tx.vulnerability.update({
            where: { id: decision.targetId },
            data: { description: data.description },
          });
        }
        const cvssScore = data.cvssScore;
        if (cvssScore !== null || data.cvssVector) {
          await enrichVulnerabilityCvss(decision.targetId, {
            cvssScore,
            cvssVector: data.cvssVector,
          });
        }
        if (decision.op === "update") summary.updated++;
        else summary.linked++;
      } else if (decision.kind === "remediation") {
        if (!("notificationId" in owner)) {
          summary.skipped++;
          continue;
        }
        if (
          !decision.targetId ||
          !validIds.remediation.has(decision.targetId)
        ) {
          summary.skipped++;
          continue;
        }
        await tx.notificationRemediationMapping.upsert({
          where: {
            notificationId_remediationId: {
              notificationId: owner.notificationId,
              remediationId: decision.targetId,
            },
          },
          create: {
            notificationId: owner.notificationId,
            remediationId: decision.targetId,
            confidence,
            reasonWhy: decision.reasonWhy,
          },
          update: { confidence, reasonWhy: decision.reasonWhy },
        });
        if (decision.op === "update") {
          const data = cleanFields(decision.fields);
          if (data.description) {
            await tx.remediation.update({
              where: { id: decision.targetId },
              data: { description: data.description },
            });
          }
          summary.updated++;
        } else {
          summary.linked++;
        }
      } else if (decision.kind === "asset") {
        if (!("notificationId" in owner)) {
          summary.skipped++;
          continue;
        }
        if (!decision.targetId || !validIds.asset.has(decision.targetId)) {
          summary.skipped++;
          continue;
        }
        await tx.notificationAssetMapping.upsert({
          where: {
            notificationId_assetId: {
              notificationId: owner.notificationId,
              assetId: decision.targetId,
            },
          },
          create: {
            notificationId: owner.notificationId,
            assetId: decision.targetId,
            confidence,
            reasonWhy: decision.reasonWhy,
          },
          update: { confidence, reasonWhy: decision.reasonWhy },
        });
        const data = cleanFields(decision.fields);
        if (data.macAddress || data.serialNumber) {
          await enrichAssetIdentifiers(decision.targetId, {
            macAddress: data.macAddress,
            serialNumber: data.serialNumber,
          });
        }
        summary.linked++;
      } else {
        summary.skipped++;
      }
    }
  });

  return summary;
}
