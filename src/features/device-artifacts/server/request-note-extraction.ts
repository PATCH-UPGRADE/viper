import "server-only";
import { inngest } from "@/inngest/client";

// Kept apart from the Inngest function module, which registers a function and
// loads the notes agent on import. Callers only need to send the event.
export const EXTRACT_EVENT = "device-artifact/notes.extract.requested" as const;

/**
 * Ask the extractor to process one device artifact's documentation.
 *
 * Best-effort: note extraction is a background enhancement, so a failure to
 * enqueue (for example, an unreachable event bus) is logged, never thrown. It
 * must not fail the caller: the artifact create mutation or an integration sync.
 */
export async function requestArtifactNoteExtraction(
  deviceArtifactId: string,
): Promise<void> {
  try {
    await inngest.send({ name: EXTRACT_EVENT, data: { deviceArtifactId } });
  } catch (err) {
    console.error(
      `Failed to enqueue note extraction for device artifact ${deviceArtifactId}`,
      err,
    );
  }
}
