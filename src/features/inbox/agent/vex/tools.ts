// the structured output schema the agent's tool call is validated against, 
//
// Example:
// {
//   issue_id_i: {
//     status: {
//       status: "UNDER_INVESTIGATION",
//     },
//     reasonWhy: "Unsure if code could be exploited here or not"
//   },
//   issue_id_ii: {
//     assets: {
//        id: "asset_id_foo",
//        status: {
//          status: "NOT_AFFECTED",
//          justification: "HOSPITAL_COMPENSATING_CONTROL"
//        }
//        reasonWhy: "This asset is on a subnet that never sees the light of day"
//     }
//   }
// }
// Means that issue_id_i is being modified to be under investigation,
// issue_id_ii stays the same, but asset_id_foo gets a new issue saying that
// this particular asset is not affected

import "server-only";
import { z } from "zod";
import type { IssueStatus, NotAffectedJustification } from "@/generated/prisma";

/** Subset of NotAffectedJustification the agent is allowed to emit. */
const VEX_JUSTIFICATIONS = [
  "COMPONENT_NOT_PRESENT",
  "VULNERABLE_CODE_CANNOT_BE_CONTROLLED_BY_ADVERSARY",
  "HOSPITAL_COMPENSATING_CONTROL",
  "HOSPITAL_ACCEPTS_RISK",
] as const satisfies readonly NotAffectedJustification[];
export type VexNotAffectedJustification = (typeof VEX_JUSTIFICATIONS)[number];

const statusSchema = z
  .discriminatedUnion("status", [
    z.object({ status: z.literal("AFFECTED") }),
    z.object({ status: z.literal("UNDER_INVESTIGATION") }),
    z.object({
      status: z.literal("NOT_AFFECTED"),
      justification: z
        .enum(VEX_JUSTIFICATIONS)
        .describe(
          "VEX justification — required when the status is NOT_AFFECTED",
        ),
    }),
  ])
  .describe(
    "The determination. AFFECTED = at risk, UNDER_INVESTIGATION = possibly at risk (insufficient detail), NOT_AFFECTED = unaffected (must carry a justification).",
  );

const assetOverrideSchema = z.object({
  id: z
    .string()
    .describe(
      "Asset id — must be one of the asset ids listed under this issue. Only emit an override when this single asset differs from the rest of its device group.",
    ),
  status: statusSchema,
  reasonWhy: z.string().describe("Concise justification for this asset."),
});

const issueValueSchema = z.object({
  status: statusSchema
    .nullish()
    .describe(
      "The device-group-level determination. Omit to leave the group issue unchanged while still flagging an asset exception below.",
    ),
  reasonWhy: z
    .string()
    .nullish()
    .describe("Concise reasoning for the group-level status, if you set one."),
  confidence: z
    .enum(["NeedsReview", "Matched"])
    .nullish()
    .describe(
      "Matched = strong evidence; NeedsReview = plausible but a human should verify.",
    ),
  assets: z
    .array(assetOverrideSchema)
    .nullish()
    .describe(
      "Asset-level overrides. Leave empty unless a specific asset differs from its device group (e.g. a note on that asset id).",
    ),
});

/** Build the per-request tool schema: one optional property per baseline issue id. */
export function buildVexSchema(issueIds: string[]) {
  return z.object(
    Object.fromEntries(issueIds.map((id) => [id, issueValueSchema.optional()])),
  );
}

// Loose types (independent of the dynamic zod schema) used by the deterministic
// planner so it can be unit-tested without constructing the schema.
export type StatusValue = {
  status: IssueStatus;
  justification?: VexNotAffectedJustification | null;
};
export type AssetOverrideValue = {
  id: string;
  status: StatusValue;
  reasonWhy: string;
};
export type IssueValue = {
  status?: StatusValue;
  reasonWhy?: string;
  confidence?: "NeedsReview" | "Matched";
  assets?: AssetOverrideValue[] | null;
};
export type VexResult = Record<string, IssueValue | undefined>;
