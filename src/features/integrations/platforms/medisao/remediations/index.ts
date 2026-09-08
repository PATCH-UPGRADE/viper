import type { ResourceModule } from "../../../core/types";
import type { MedIsaoConfig, MedIsaoCreds } from "../config";
import { comments } from "./comments";
import type { MedIsaoRemediationItem, RawMedIsaoRemediation } from "./feed";
import { inquiries } from "./inquiries";
import { syncRemediations } from "./sync";

/**
 * No url builders: every MedISAO remediation endpoint is scoped to a channel,
 * and an external id alone does not say which channel it came from. The sync
 * records the endpoint on the mapping row instead, where the channel is known.
 */
export const remediations: ResourceModule<
  MedIsaoRemediationItem,
  RawMedIsaoRemediation,
  MedIsaoConfig,
  MedIsaoCreds
> = {
  sync: syncRemediations,

  comments,
  inquiries,

  defaultSyncEvery: 86400,
};
