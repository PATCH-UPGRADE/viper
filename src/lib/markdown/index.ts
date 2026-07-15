// Barrel for the db-item → markdown renderers.

export {
  type AssetForMarkdown,
  assetToMarkdown,
  parseLocation,
  renderUtilization,
} from "./asset";
export {
  type DeviceIdentity,
  deviceGroupCpeList,
  deviceGroupLabel,
  deviceGroupMatchingLabel,
  deviceGroupMatchingsSummary,
  deviceGroupToMarkdown,
  deviceIdentityInline,
} from "./device-group";
export { generateMemoryMarkdown } from "./memory";
export {
  type NoteRow,
  type NoteTargetLabels,
  renderNoteTarget,
} from "./note";
export {
  type RemediationForMarkdown,
  remediationToMarkdown,
} from "./remediation";
export { type CanonicalRef, shortId, truncate } from "./shared";
export {
  type VulnerabilityForMarkdown,
  vulnerabilityToMarkdown,
} from "./vulnerability";
export { generateWorkflowsMarkdown, workflowClinicalSummary } from "./workflow";
