import type { ResourceModule } from "../../../core/types";
import type { MedIsaoConfig, MedIsaoCreds } from "../config";
import type { MedIsaoAdvisoryItem, RawMedIsaoAdvisory } from "./feed";
import { advisorySourceAdapter } from "./notification-source";
import { syncAdvisories } from "./sync";

/**
 * No url builders: every MedISAO advisory endpoint is scoped to a channel, and
 * an external id alone does not say which channel it came from. The sync writes
 * the endpoint onto the mapping row instead, where the channel is known.
 */
export const advisories: ResourceModule<
  MedIsaoAdvisoryItem,
  RawMedIsaoAdvisory,
  MedIsaoConfig,
  MedIsaoCreds
> = {
  sync: syncAdvisories,

  sourceRecords: advisorySourceAdapter,

  defaultSyncEvery: 86400,
};
