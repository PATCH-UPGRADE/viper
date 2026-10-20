import { z } from "zod";
import { type Prisma, RemediationCategory } from "@/generated/prisma";

export const remediationReleaseFieldsSchema = z.object({
  category: z
    .enum(RemediationCategory)
    .nullish()
    .describe("What kind of fix it is"),
  publishedAt: z.iso
    .datetime({ offset: true })
    .nullish()
    .describe("When the manufacturer released it"),
  isSecurityUpdate: z
    .boolean()
    .nullish()
    .describe(
      "Whether it addresses a cybersecurity issue. Omit if not stated: a remediation linked to a vulnerability counts as one",
    ),
});

export type ReleaseScalars = z.infer<typeof remediationReleaseFieldsSchema>;
export const RELEASE_FIELDS = remediationReleaseFieldsSchema.keyof().options;

export const remediationReleaseResponseSchema = z.object({
  category: z.enum(RemediationCategory).nullable(),
  publishedAt: z.date().nullable(),
  isSecurityUpdate: z.boolean().nullable(),
});

/**
 * Build the data for the release column from what a writer sent. A
 * field in the result is written; a field left of it is not touched.
 * replace: the TA4 API. Null clears the column
 * stated: an integration sync(MedISAO, Fllet), null means the feed didn't say so it is skipped
 * @param input
 * @param mode
 * @returns
 */
export function releaseScalarData(
  input: ReleaseScalars | null | undefined,
  mode: "replace" | "stated",
): ReleaseScalars {
  const out: Record<string, unknown> = {};
  if (!input) return out;
  for (const field of RELEASE_FIELDS) {
    const value = input[field];
    if (value === undefined) continue;
    if (mode === "stated" && value === null) continue;
    out[field] = value;
  }
  return out as ReleaseScalars;
}

export function isSecurityRelated(r: {
  isSecurityUpdate: boolean | null;
  _count: { vulnerabilities: number };
}): boolean | null {
  if (r.isSecurityUpdate !== null) return r.isSecurityUpdate;
  return r._count.vulnerabilities > 0 ? true : null;
}

export const securityRelatedWhere = {
  OR: [
    { isSecurityUpdate: true },
    { isSecurityUpdate: null, vulnerabilities: { some: {} } },
  ],
} satisfies Prisma.RemediationWhereInput;
