import { z } from "zod";

/**
 * A resolved, entity-scoped note as surfaced on assets / vulnerabilities /
 * remediations reads. PERSISTENT (hospital-wide) notes are excluded, so only
 * id + text are useful here (status is always SCOPED, targetModel is implied by
 * the entity it hangs off of).
 */
export const scopedNoteSchema = z.object({
  id: z.string(),
  text: z.string(),
});

export type ScopedNote = z.infer<typeof scopedNoteSchema>;
