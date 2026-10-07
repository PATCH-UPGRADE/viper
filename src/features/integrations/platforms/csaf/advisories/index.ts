import type { ResourceModule } from "@/features/integrations/core/types";
import type { CsafConfig, CsafCreds } from "../config";
import type { CsafAdvisoryItem, CsafDocument } from "../document";
import { advisorySourceAdapter } from "./notification-source";
import { syncAdvisories } from "./sync";

export const advisories: ResourceModule<
  CsafAdvisoryItem,
  CsafDocument,
  CsafConfig,
  CsafCreds
> = {
  sync: syncAdvisories,
  sourceRecords: advisorySourceAdapter,
  defaultSyncEvery: 86400, // sync daily
};
