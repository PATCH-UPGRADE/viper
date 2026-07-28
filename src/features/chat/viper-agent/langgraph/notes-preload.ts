import "server-only";
import { getRelevantNotes } from "@/features/notes/server/get-relevant-notes";
import { type NoteTargetLabels, renderNoteTarget } from "@/lib/markdown/note";


/**
 * Example:
 *
 * ## Notes (hospital-wide)
 *
 * - The hospital is a rural, critical access hospital with 12 inpatient beds.
 */
export async function loadPersistentNotesMarkdown(): Promise<string> {
  const notes = await getRelevantNotes({});
  if (notes.length === 0) {
    return "## Notes (hospital-wide)\n\n_No persistent notes saved yet._";
  }
  return (
    "## Notes (hospital-wide)\n\n" +
    notes
      .map((n) => `- ${n.text}`)
      .join("\n")
  );
}
