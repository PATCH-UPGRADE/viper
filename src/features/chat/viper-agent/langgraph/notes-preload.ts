import "server-only";
import { getRelevantNotes } from "@/features/notes/server/get-relevant-notes";
import { type NoteTargetLabels, renderNoteTarget } from "@/lib/markdown/note";

// PERSISTENT notes render as a fixed "Persistent (hospital-wide)" label and
// never dereference these maps, so empty maps are sufficient here.
const EMPTY_NOTE_LABELS: NoteTargetLabels = {
  assetLabel: new Map(),
  groupLabel: new Map(),
  matchingLabel: new Map(),
  cveById: new Map(),
};

/**
 * The sole deterministic context injected before both agents' first turn: the
 * hospital-wide PERSISTENT notes. Everything else (assets, vulnerabilities,
 * remediations, …) is fetched on demand via query_platform_data.
 *
 * getRelevantNotes({}) with no entity ids returns exactly the PERSISTENT notes.
 */
export async function loadPersistentNotesMarkdown(): Promise<string> {
  const notes = await getRelevantNotes({});
  if (notes.length === 0) {
    return "## Notes (hospital-wide)\n\n_No persistent notes saved yet._";
  }
  return (
    "## Notes (hospital-wide)\n\n" +
    notes
      .map((n) => `- **${renderNoteTarget(n, EMPTY_NOTE_LABELS)}**: ${n.text}`)
      .join("\n")
  );
}
