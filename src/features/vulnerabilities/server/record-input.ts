// Turns a vulnerability record from the API or an integration into the record service's input.
import "server-only";
import { TRPCError } from "@trpc/server";
import { type Prisma, VulnerabilitySource } from "@/generated/prisma";
import { resolveMatchingId } from "@/lib/router-utils";
import type {
  VulnerabilityRecordInput,
  VulnerabilityRecordUpdateInput,
} from "../types";
import type {
  VulnerabilityRecordData,
  VulnerabilityRecordPatch,
} from "./records";

/**
 * The record's source. Omitted, it is TA3 with a TA3 submission and OTHER without one. A TA3
 * submission only goes on a TA3 record, and a TA3 record always has one.
 */
function resolveSource(
  input: Pick<VulnerabilityRecordInput, "source" | "ta3Submission">,
): VulnerabilitySource {
  const source =
    input.source ??
    (input.ta3Submission ? VulnerabilitySource.TA3 : VulnerabilitySource.OTHER);
  if (input.ta3Submission && source !== VulnerabilitySource.TA3) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `ta3Submission is only allowed on a TA3 record, not ${source}`,
    });
  }
  if (source === VulnerabilitySource.TA3 && !input.ta3Submission) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "A TA3 record needs a ta3Submission",
    });
  }
  return source;
}

/** Resolve each device to a shared DeviceGroupMatching. Names come from the source, not CPEs. */
async function resolveDevices(
  devices: VulnerabilityRecordInput["devices"] | undefined,
): Promise<string[] | undefined> {
  if (!devices) return undefined;
  const ids = [];
  // Sequential, so two devices naming the same new manufacturer don't race to create it.
  for (const device of devices) {
    ids.push(await resolveMatchingId({ ...device, hasCpe: false }));
  }
  return [...new Set(ids)];
}

/** Undefined stays undefined, so an update leaves the field alone. */
const toDate = (value: string | null | undefined) =>
  value === undefined ? undefined : value === null ? null : new Date(value);

function toSubmission(
  submission: VulnerabilityRecordInput["ta3Submission"],
): VulnerabilityRecordData["ta3Submission"] {
  return submission
    ? { ...submission, sarif: submission.sarif as Prisma.InputJsonValue }
    : undefined;
}

/**
 * @param options.source Overrides the input's source, for integrations whose records always
 *   come from one source (the AI crawler). Otherwise the input's source rules apply.
 * @param options.userId The record's owner, or null for a record anyone may change.
 */
export async function recordDataFromInput(
  input: VulnerabilityRecordInput,
  options: { source?: VulnerabilitySource; userId: string | null },
): Promise<VulnerabilityRecordData> {
  const source = options.source ?? resolveSource(input);
  return {
    source,
    externalId: input.externalId,
    identifiers: input.identifiers,
    summary: input.summary,
    details: input.details,
    publishedAt: toDate(input.publishedAt),
    metrics: input.metrics,
    deviceGroupMatchingIds: await resolveDevices(input.devices),
    ta3Submission: toSubmission(input.ta3Submission),
    userId: options.userId,
  };
}

export async function recordPatchFromInput(
  input: VulnerabilityRecordUpdateInput,
): Promise<VulnerabilityRecordPatch> {
  return {
    externalId: input.externalId,
    identifiers: input.identifiers,
    summary: input.summary,
    details: input.details,
    publishedAt: toDate(input.publishedAt),
    metrics: input.metrics,
    deviceGroupMatchingIds: await resolveDevices(input.devices),
    ta3Submission: toSubmission(input.ta3Submission),
  };
}
