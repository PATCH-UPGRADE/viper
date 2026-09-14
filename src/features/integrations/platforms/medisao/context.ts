import "server-only";
import type { IntegrationContext } from "../../core/context";
import {
  configSchema,
  credentialSchema,
  type MedIsaoConfig,
  type MedIsaoCreds,
} from "./config";

/**
 * What MedISAO needs to make one call on behalf of an integration, outside a
 * sync. The same two pieces a `SyncCtx` carries, minus everything a sync
 * attempt owns — there is no cursor and no watermark when a person is waiting.
 */
export interface MedIsaoCallCtx {
  config: MedIsaoConfig;
  creds: MedIsaoCreds;
}

/**
 * Narrow a loaded integration to this platform's own shapes.
 *
 * `loadIntegrationContext` is platform-agnostic and hands back `unknown`, so it
 * is parsed here rather than asserted: an integration row pointing at another
 * platform fails loudly instead of reaching MedISAO's API as the wrong shape.
 */
export const medisaoCallCtx = (ctx: IntegrationContext): MedIsaoCallCtx => ({
  config: configSchema.parse(ctx.config),
  creds: credentialSchema.parse(ctx.creds),
});
