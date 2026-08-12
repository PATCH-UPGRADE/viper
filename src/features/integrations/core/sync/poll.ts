import "server-only";
import type { AnyConnectorModule, SyncCtx, SyncOutcome } from "../types";
import { moduleForResource } from "./resources";

/**
 * The default `listChanged -> toCanonical -> ingest -> advance cursor` loop, for
 * platforms whose protocol we speak.
 *
 * Nothing uses it yet — `ai` and `partner` bring their own strategies and never
 * fetch. It ships now because `resolveSyncStrategy` needs a fallback, and an
 * interface nothing implements isn't an interface.
 */
export async function pollSync(
  module: AnyConnectorModule,
  ctx: SyncCtx<unknown, unknown>,
): Promise<SyncOutcome> {
  const resourceModule = moduleForResource(module, ctx.resource);
  if (!resourceModule) {
    throw new Error(
      `Platform ${module.definition.platform} has no ResourceModule for ${ctx.resource}`,
    );
  }

  let cursor = ctx.cursor;
  for await (const page of resourceModule.listChanged(ctx.session, cursor)) {
    const canonical = page.items.map((raw) =>
      resourceModule.toCanonical(raw, ctx.config),
    );
    await ctx.ingest(canonical);
    // Advance only after the ingest succeeds. A crash replays the page, and
    // ingest dedups on (integrationId, externalId), so replay is idempotent.
    cursor = page.cursor;
  }

  return { cursor };
}
