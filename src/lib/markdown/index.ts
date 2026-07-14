// Barrel for the db-item → markdown renderers. Import everything from
// "@/lib/markdown" so entity renderers and their shared primitives live behind a
// single module boundary.

export {
  type AssetForMarkdown,
  assetToMarkdown,
  parseLocation,
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
export {
  type CanonicalRef,
  DAY_NAMES,
  renderUtilization,
  shortId,
  truncate,
  utilizationBucket,
} from "./shared";
export {
  type VulnerabilityForMarkdown,
  vulnerabilityToMarkdown,
} from "./vulnerability";
