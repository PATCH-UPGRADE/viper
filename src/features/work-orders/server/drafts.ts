import "server-only";
import { SubmissionState } from "@/generated/prisma";
import type { TransactionClient } from "@/lib/db";
import {
  deviceGroupWhereForMatching,
  matchingAppliesToDeviceGroup,
} from "@/lib/device-matching";
import { keepFileableTargets, validatePayloadForModule } from "./payload";
import { resolveWorkOrderTargets } from "./targets";

/**
 * Just the two reads this needs, so it takes either the client or a transaction
 * without naming Prisma's generated client type.
 */
type MatchingReader = Pick<TransactionClient, "deviceGroupMatching" | "asset">;

/**
 * Which assets does a set of device group matchings cover?
 *
 * The single answer to that question. A mitigation plan's work order names
 * matchings, not assets, so its filing target is found by expanding them here,
 * and `attachMatchingAssets` expands them again through this same call when the
 * plan is accepted. Two implementations could drift, and a target resolved
 * against a different set than the one that gets the child tickets would file
 * for assets the order does not cover.
 *
 * Two steps, because a version range cannot be expressed in SQL. The `where`
 * narrows to the manufacturer and product, then the range is evaluated in
 * memory.
 */
export async function assetsForMatchings(
  db: MatchingReader,
  matchingIds: string[],
) {
  if (matchingIds.length === 0) return [];

  const matchings = await db.deviceGroupMatching.findMany({
    where: { id: { in: matchingIds } },
    select: {
      manufacturerId: true,
      productId: true,
      versionId: true,
      versionRange: true,
    },
  });
  if (matchings.length === 0) return [];

  const candidates = await db.asset.findMany({
    where: { deviceGroup: { OR: matchings.map(deviceGroupWhereForMatching) } },
    select: {
      id: true,
      hostname: true,
      ip: true,
      deviceGroup: {
        select: {
          id: true,
          manufacturerId: true,
          productId: true,
          versionId: true,
          version: { select: { canonicalName: true } },
        },
      },
    },
  });

  return candidates.filter((asset) =>
    matchings.some((matching) =>
      matchingAppliesToDeviceGroup(matching, asset.deviceGroup),
    ),
  );
}

/** The same question, for a caller that only needs to know which assets. */
export async function assetIdsForMatchings(
  db: MatchingReader,
  matchingIds: string[],
): Promise<string[]> {
  return (await assetsForMatchings(db, matchingIds)).map((asset) => asset.id);
}

/**
 * What a draft work order stores about where it will be filed.
 *
 * `platformPayload` is absent rather than null when there is no target: a
 * Prisma Json column reads `null` as the JSON value null, and omitting the
 * field is what leaves the column empty.
 */
export interface DraftTarget {
  targetIntegrationId: string | null;
  platformPayload?: Record<string, unknown>;
  submissionState: SubmissionState;
}

/** VIPER tracks the order and no vendor platform is involved. */
const VIPER_ONLY: DraftTarget = {
  targetIntegrationId: null,
  submissionState: SubmissionState.NONE,
};

/**
 * The three fields a draft stores about its destination, from a decision a
 * caller has already made.
 *
 * How the target is chosen differs per caller — the chat tool refuses an
 * ambiguous one so the model can correct itself, while an unattended agent
 * falls back to VIPER-only — but what gets written must not. This is the one
 * place that maps a decision onto columns, including the rule that an absent
 * payload is `undefined` rather than `null`.
 */
export function draftTargetFields(
  target: { integrationId: string } | null,
  payload: Record<string, unknown>,
): DraftTarget {
  if (!target) return VIPER_ONLY;
  return {
    targetIntegrationId: target.integrationId,
    platformPayload: payload,
    submissionState: SubmissionState.PENDING,
  };
}

/**
 * Where should a draft covering these assets be filed?
 *
 * Returns the platform when exactly one can file for the whole set. Anything
 * else is VIPER-only:
 *
 * - No target. Nobody manages these assets, or their manager's platform has no
 *   work order module.
 * - More than one target. One work order files to one platform, so an order
 *   spanning two vendors cannot be sent without splitting it, and a partial
 *   filing would send less than the approver agreed to.
 * - One target that covers only part of the set. The same partial filing, so an
 *   asset the target does not manage must not drag the rest to a vendor.
 *
 * The payload is the platform's own defaults. A drafting caller supplies no
 * platform fields — the target is not known until this runs — and every field a
 * work order module declares carries a default precisely so a bare draft is
 * fileable. A module that refuses those defaults leaves the draft VIPER-only
 * rather than failing the draft.
 */
export async function resolveDraftTarget(
  assetIds: string[],
): Promise<DraftTarget> {
  if (assetIds.length === 0) return VIPER_ONLY;

  const { targets, unmanaged } = keepFileableTargets(
    await resolveWorkOrderTargets(assetIds),
  );
  if (targets.length !== 1 || unmanaged.length > 0) return VIPER_ONLY;

  const [target] = targets;
  const checked = validatePayloadForModule(
    target.module,
    target.integrationName,
    {},
  );
  if (!checked.ok) return VIPER_ONLY;

  return draftTargetFields(target, checked.payload);
}
