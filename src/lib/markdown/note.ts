// Note → markdown target-label renderer. A note points at some in-scope entity
// (asset, device-group matching, vulnerability, remediation) or is a persistent
// hospital-wide note; this resolves that target to a human-readable label given
// pre-built id → label lookups.

export type NoteRow = {
  text: string;
  status: string;
  targetModel: string | null;
  instanceId: string | null;
};

export type NoteTargetLabels = {
  assetLabel: Map<string, string>;
  groupLabel: Map<string, string>;
  matchingLabel: Map<string, string>;
  cveById: Map<string, string>;
};

export function renderNoteTarget(
  note: NoteRow,
  labels: NoteTargetLabels,
): string {
  if (note.status === "PERSISTENT") return "Persistent (hospital-wide)";
  const id = note.instanceId ?? "";
  switch (note.targetModel) {
    case "ASSET":
      return `Asset ${labels.assetLabel.get(id) ?? id} (id: ${id})`;
    case "DEVICE_GROUP_MATCHING":
      return `Matching ${labels.matchingLabel.get(id) ?? id}`;
    case "VULNERABILITY":
      return `Vulnerability ${labels.cveById.get(id) ?? id}`;
    case "REMEDIATION":
      return `Remediation ${id}`;
    default:
      return "Unknown target";
  }
}
