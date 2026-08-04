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
  if (note.status === "PERSISTENT") return "";
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

// build the question and answer text stored in a note
export function renderQnA(title: string, answer: string | null): string {
  return `Q: ${title}\nA: ${answer ?? "(no answer)"}`;
}
