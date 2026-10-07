import { aiExtractAndMatch } from "@/features/inbox/link-entities";
import type { SourceRecordAdapter } from "@/features/inbox/source-adapter";
import { parseTlp } from "@/lib/tlp";
import { csafDocumentSchema } from "../document";
import { toMarkdown } from "../markdown";

export const advisorySourceAdapter: SourceRecordAdapter = {
  prepare(raw) {
    const parsed = csafDocumentSchema.parse(raw);
    const { tracking, title, publisher, distribution } = parsed.document;
    const doc = {
      from: publisher.name,
      subject: `${tracking.id} : ${title}`,
      markdown: toMarkdown(parsed),
    };
    return {
      doc,
      linkEntities: aiExtractAndMatch(doc),
      known: { tlp: parseTlp(distribution?.tlp?.label) },
    };
  },
};
