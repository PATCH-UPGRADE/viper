import { release } from "os";
import type { CsafDocument } from "./document";

const productNames = (doc: CsafDocument): Map<string, string> => {
  const names = new Map<string, string>();
  const walk = (branches: unknown[]) => {
    for (const branch of branches) {
      if (typeof branch !== "object" || branch === null) continue;
      const node = branch as {
        product?: { product_id: string; name?: string };
        branches?: unknown[];
      };
      if (node.product) {
        names.set(
          node.product.product_id,
          node.product.name ?? node.product.product_id,
        );
      }
      if (node.branches) walk(node.branches);
    }
  };
  walk(((doc.product_tree ?? {}) as { branches?: unknown[] }).branches ?? []);
  return names;
};

const productLine = (id: string, names: Map<string, string>): string =>
  `- ${names.get(id) ?? id}`;

export const toMarkdown = (doc: CsafDocument): string => {
  const { tracking, title, publisher, distribution } = doc.document;
  const names = productNames(doc);

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
        `** CVSS v3: ** ${cvss.baseScore}` +
          `${cvss.baseSeverity}` +
          `- \`${cvss.vectorString}\``,
      vuln.notes.find((note) => note.category === "summary")?.text,
      affected.length > 0 &&
        [
          "",
          "** Affected**",
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
              `- _${r.category}_: ${r.details} (r.url ?  - ${r.url} : "")`,
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
    meta.join(" "),
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
