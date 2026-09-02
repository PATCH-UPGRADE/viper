import "server-only";
import type { WorkOrderFiler } from "@/features/integrations/core/types";
import type { FleetConfig, FleetCreds } from "../config";
import { createFleetSession } from "../session";
import { create, type FleetWorkOrderDraft } from "./tickets";

/**
 * Sign in once and file every order of one submission through that session.
 * Signing in drives a headless browser, so a proposal covering several assets
 * must not repeat it once per asset.
 */
export async function openFiler(input: {
  config: FleetConfig;
  creds: FleetCreds;
}): Promise<WorkOrderFiler<FleetWorkOrderDraft>> {
  const session = await createFleetSession(input.creds);
  return { file: (draft) => create(session, draft, input.config) };
}
