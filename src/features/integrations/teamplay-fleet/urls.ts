// Client-safe Fleet URL builders (no server-only imports). The work-order
// Source card and any other UI that links to a Fleet record use these.

import { FLEET_HOST } from "./constants";

/**
 * Builds the user-facing detail page URL for a Fleet work order. Fleet exposes
 * each work order as an "activity", keyed by the external id we store on the
 * ExternalWorkOrderMapping.
 *
 * The URL pattern is hard-coded on purpose. Fleet sends no link in its payload,
 * so we build the URL from the host and the external id. The pattern lives in
 * code, not in the database. So a Fleet URL change is a one-line edit here, and
 * never a data migration.
 */
export function fleetWorkOrderDetailUrl(externalId: string): string {
  return `https://${FLEET_HOST}/activities/${externalId}/overview`;
}

/** Returns true when an integration URI points at Fleet. */
export function isFleetIntegrationUri(
  integrationUri: string | null | undefined,
): boolean {
  return !!integrationUri && integrationUri.toLowerCase().includes(FLEET_HOST);
}

/**
 * Resolves the detail URL for a work order from its ExternalWorkOrderMapping.
 * Returns the Fleet URL when the mapping's integration is Fleet. Returns null
 * for any other integration, so the caller can fall back.
 */
export function resolveWorkOrderDetailUrl(
  integrationUri: string | null | undefined,
  externalId: string,
): string | null {
  return isFleetIntegrationUri(integrationUri)
    ? fleetWorkOrderDetailUrl(externalId)
    : null;
}
