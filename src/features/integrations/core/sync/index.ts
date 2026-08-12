import "server-only";
import { INTEGRATION_SYNC_EVERY_MIN } from "@/config/constants";
import type { AnyConnectorModule, SyncStrategy } from "../types";
import { pollSync } from "./poll";

/**
 * The platform's own strategy, else core's poll loop bound to its
 * ResourceModules.
 *
 * Takes the module rather than the platform enum because `pollSync` needs the
 * ResourceModule fields, and `SyncCtx` deliberately doesn't carry the module.
 */
export const resolveSyncStrategy = (
  module: AnyConnectorModule,
): SyncStrategy<unknown, unknown> =>
  module.sync ?? ((ctx) => pollSync(module, ctx));

/**
 * Resolve the effective cadence for a resource.
 * Cascade based on what's defined for each resource/integration/platform
 */
export const effectiveSyncEvery = (
  resourceSyncEvery: number | null,
  integrationSyncEvery: number | null,
  moduleDefault: number | null,
): number =>
  resourceSyncEvery ??
  integrationSyncEvery ??
  moduleDefault ??
  INTEGRATION_SYNC_EVERY_MIN * 60;

/** Backoff with jitter, so instances don't fall into lockstep. */
export const computeNextSyncAt = (
  seconds: number,
  consecutiveFailures: number,
): Date => {
  const backoff = seconds * 2 ** Math.min(consecutiveFailures, 6);
  const capped = Math.min(backoff, 24 * 60 * 60);
  const jittered = capped * (0.9 + Math.random() * 0.2);
  return new Date(Date.now() + jittered * 1000);
};
