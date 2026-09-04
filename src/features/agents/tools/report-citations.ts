import "server-only";

/**
 * Report citations are plain Markdown links to the app's own entity routes, e.g.
 * `[MRI-01](/assets/cly...)`. Before a report is saved, every such link is
 * checked against the real record ids; a link whose id doesn't resolve is
 * de-linked (kept as plain text) rather than failing the whole save.
 *
 * This module is the pure parse/rewrite half — the DB check is injected so it's
 * testable without Prisma. See report-tool.ts for the wiring.
 */

/** Route path segment -> which entity it cites. Only routes that exist. */
const CITATION_SEGMENTS = [
  "assets",
  "vulnerabilities",
  "remediations",
] as const;
export type CitationSegment = (typeof CITATION_SEGMENTS)[number];

const LINK_RE = new RegExp(
  `\\[([^\\]]+)\\]\\(/(${CITATION_SEGMENTS.join("|")})/([A-Za-z0-9_-]+)\\)`,
  "g",
);

type ValidIdResolver = (
  segment: CitationSegment,
  ids: string[],
) => Promise<Set<string>>;

/**
 * Rewrite `markdown`, keeping only citation links whose id the resolver
 * confirms. Returns the cleaned Markdown and how many links were de-linked.
 */
export async function rewriteReportCitations(
  markdown: string,
  resolveValidIds: ValidIdResolver,
): Promise<{ markdown: string; dropped: number }> {
  // Collect cited ids per segment, then replace each Set with the subset that
  // actually resolves.
  const bySegment = new Map<CitationSegment, Set<string>>();
  for (const [, , segment, id] of markdown.matchAll(LINK_RE)) {
    const seg = segment as CitationSegment;
    (bySegment.get(seg) ?? bySegment.set(seg, new Set()).get(seg)!).add(id);
  }
  await Promise.all(
    [...bySegment].map(async ([seg, ids]) => {
      bySegment.set(seg, await resolveValidIds(seg, [...ids]));
    }),
  );

  let dropped = 0;
  const rewritten = markdown.replace(
    LINK_RE,
    (full, label: string, segment: string, id: string) => {
      if (bySegment.get(segment as CitationSegment)?.has(id)) return full;
      dropped += 1;
      return label;
    },
  );
  return { markdown: rewritten, dropped };
}
