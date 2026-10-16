import { z } from "zod";
import {
  ImpactEffect,
  ImpactPhase,
  type Prisma,
  RemediationMechanism,
} from "@/generated/prisma";

export const featureImpactSchema = z.object({
  phase: z
    .enum(ImpactPhase)
    .describe(
      "DURING_APPLY: only while apply. AFTER_APPLY: persists afterwards",
    ),
  feature: z
    .string()
    .trim()
    .min(1)
    .describe("The affected device feature, e.g. nurse call button"),
  effect: z.enum(ImpactEffect),
  clinicalWorkflowImpact: z
    .boolean()
    .nullish()
    .describe("Whether clinicians must be told about it in advance"),
  notes: z.string().nullish(),
});

export type FeatureImpactInput = z.infer<typeof featureImpactSchema>;

export const remediationImpactFieldsSchema = z.object({
  mechanism: z
    .enum(RemediationMechanism)
    .nullish()
    .describe("How it reaches the device"),
  requiresDowntime: z.boolean().nullish(),
  restartRequired: z.boolean().nullish(),
  estimatedDurationSeconds: z
    .number()
    .int()
    .min(0)
    .nullish()
    .describe("Time to apply, whether or not the device is down"),
  estimatedDowntimeSeconds: z.number().int().min(0).nullish(),
  disablesFeatures: z.boolean().nullish(),
  reversible: z.boolean().nullish().describe("Whether it can be rolled back"),
  verificationRequired: z
    .boolean()
    .nullish()
    .describe("Whether the vendor requires validation after it is applied"),
  verificationNotes: z.string().nullish(),
});

export const remediationImpactSchema = remediationImpactFieldsSchema.extend({
  impacts: z.array(featureImpactSchema).optional(),
});

export type RemediationImpactInput = z.infer<typeof remediationImpactSchema>;

export type ImpactScalars = z.infer<typeof remediationImpactFieldsSchema>;
export const IMPACT_FIELDS = remediationImpactFieldsSchema.keyof().options;

// replace: TA4 team
// stated: MedISAO sync
// fillGaps: Email
export type ImpactWriteMode = "replace" | "stated" | "fillGaps";

export const impactStateSelect = {
  mechanism: true,
  requiresDowntime: true,
  restartRequired: true,
  estimatedDurationSeconds: true,
  estimatedDowntimeSeconds: true,
  disablesFeatures: true,
  reversible: true,
  verificationRequired: true,
  verificationNotes: true,
  _count: { select: { impacts: true } },
} satisfies Prisma.RemediationSelect;

export type ImpactState = Prisma.RemediationGetPayload<{
  select: typeof impactStateSelect;
}>;

export function impactScalarData(
  impact: ImpactScalars | null | undefined,
  mode: ImpactWriteMode,
  existing?: ImpactState | null,
): ImpactScalars {
  const out: Record<string, unknown> = {};
  if (!impact) return out;
  for (const field of IMPACT_FIELDS) {
    const value = impact[field];
    if (value === undefined) continue;
    if (mode !== "replace" && value === null) continue;
    if (mode === "fillGaps" && existing?.[field] !== null) continue;
    out[field] = value;
  }
  return out as ImpactScalars;
}

export function impactRowsUpdate(
  impacts: FeatureImpactInput[] | undefined,
  mode: ImpactWriteMode,
  existing?: ImpactState | null,
) {
  if (impacts === undefined) return undefined;
  if (mode !== "replace" && impacts.length === 0) return undefined;
  if (mode === "fillGaps" && (existing?._count.impacts ?? 0) > 0) {
    return undefined;
  }
  return { deleteMany: {}, create: impacts };
}

export const remediationImpactRowSelect = {
  select: {
    id: true,
    phase: true,
    feature: true,
    effect: true,
    clinicalWorkflowImpact: true,
    notes: true,
  },
  orderBy: { createdAt: "asc" },
} as const;

export const remediationImpactRowSchema = z.object({
  id: z.string(),
  phase: z.enum(ImpactPhase),
  feature: z.string(),
  effect: z.enum(ImpactEffect),
  clinicalWorkflowImpact: z.boolean().nullable(),
  notes: z.string().nullable(),
});

// lists which impact fields on a remediation actually have a value
export function statedImpactFields(
  r: ImpactScalars & { impacts?: unknown[]; _count?: { impacts: number } },
): string[] {
  const stated: string[] = [];

  for (const field of IMPACT_FIELDS) {
    const value = r[field];
    if (value !== null && value !== undefined && value !== "") {
      stated.push(field);
    }
  }
  const rowCount = r.impacts?.length ?? r._count?.impacts ?? 0;
  if (rowCount > 0) {
    stated.push("impacts");
  }
  return stated;
}

export const hasStatedImpact = (
  r: Parameters<typeof statedImpactFields>[0],
): boolean => statedImpactFields(r).length > 0;
