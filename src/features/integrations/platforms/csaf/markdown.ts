import { type CsafDocument, indexProductTree } from "./document";

const productLine = (id: string, names: Map<string, string>): string =>
  `- ${names.get(id) ?? id}`;

export const toMarkdown = (doc: CsafDocument): string => {
  const { tracking, title, publisher, distribution } = doc.document;
  const { productNames: names } = indexProductTree(doc);

  const meta = [
    `**Publisher:** ${publisher.name}`,
    distribution?.tlp?.label && `**TLP:** ${distribution.tlp.label}`,
    tracking.version &&
      `**Version:** ${tracking.version}` +
        `${tracking.status ? ` (${tracking.status})` : ""}`,
    tracking.current_release_date &&
      `**Released:** ${tracking.current_release_date.slice(0, 10)}`,
  ].filter(Boolean);

  const summary = doc.document.notes.find(
    (note) => note.category === "summary",
  )?.text;

  const context = doc.document.notes
    .filter((note) => note.category === "other")
    .map((note) => `**${note.title ?? "Note"}:** ${note.text}`);

  const vulnerabilities = doc.vulnerabilities.map((vuln) => {
    const cvss = vuln.scores.find((s) => s.cvss_v3)?.cvss_v3;
    const affected = vuln.product_status.known_affected ?? [];
    const fixed = vuln.product_status.fixed ?? [];

    return [
      `### ${vuln.cve ?? "Unassigned"}${vuln.cwe ? ` — ${vuln.cwe.id} ${vuln.cwe.name}` : ""}`,
      cvss &&
        `**CVSS v3:** ${cvss.baseScore} ${cvss.baseSeverity} - \`${cvss.vectorString}\``,
      vuln.notes.find((note) => note.category === "summary")?.text,
      affected.length > 0 &&
        [
          "",
          "**Affected**",
          ...affected.map((id) => productLine(id, names)),
        ].join("\n"),
      fixed.length > 0 &&
        ["", "**Fixed in**", ...fixed.map((id) => productLine(id, names))].join(
          "\n",
        ),
      vuln.remediations.length > 0 &&
        [
          "",
          "**Remediations**",
          ...vuln.remediations.map(
            (r) =>
              `- _${r.category}_: ${r.details}${r.url ? ` - ${r.url}` : ""}`,
          ),
        ].join("\n"),
    ]
      .filter(Boolean)
      .join("\n");
  });

  const references = doc.document.references
    .filter((r) => r.category === "self" && !r.url.endsWith(".json"))
    .map((r) => `- ${r.summary ?? "Web version"}` + `: ${r.url}`);

  return [
    `# ${tracking.id}: ${title}`,
    "",
    meta.join(" · "),
    summary && ["", "## Summary", "", summary].join("\n"),
    context.length > 0 && ["", context.join("\n\n")].join("\n"),
    vulnerabilities.length > 0 &&
      ["", "## Vulnerabilities", "", vulnerabilities.join("\n\n")].join("\n"),
    references.length > 0 &&
      ["", "## References", "", references.join("\n")].join("\n"),
  ]
    .filter(Boolean)
    .join("\n");
};
