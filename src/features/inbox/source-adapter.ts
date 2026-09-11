import type { InboundEmail } from "./agent/prompt";
import type { LinkEntities } from "./pipeline";

/**
 * How one platform's stored snapshot becomes a Notification.
 *
 * A platform that records `SourceRecord`s declares this on its notifications
 * resource module, and `process-source-record` reaches it through the registry.
 * That is what keeps the job from naming any platform: it knows a snapshot has
 * an integration behind it, and asks that integration's platform what its own
 * `raw` means.
 *
 * Deliberately holds no imports from the integrations feature, so a platform
 * module can depend on this without a cycle.
 */
export interface SourceRecordAdapter {
  /**
   * Read one snapshot's `raw` into what the pipeline needs: the document its
   * agents read, and how to link what that document names.
   *
   * One call rather than two, so a platform parses `raw` once.
   */
  prepare(raw: unknown): {
    /** Sender, subject and body, whatever this platform calls them. */
    doc: InboundEmail;
    linkEntities: LinkEntities;
  };
}
