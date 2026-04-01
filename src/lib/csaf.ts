export interface CsafNote {
  title: string;
  text: string;
  category: string;
}

export interface CsafReference {
  url: string;
  summary: string;
  category: string;
}

export interface CsafRemediation {
  category: string;
  details: string;
}

export interface CsafVulnerability {
  cve: string;
  /** baseSeverity from scores[0].cvss_v3 e.g. "CRITICAL", "HIGH" */
  severity: string | null;
  /** text of the note where category === "summary" */
  summary: string | null;
  remediations: CsafRemediation[];
}

export interface ParsedCsaf {
  notes: CsafNote[];
  references: CsafReference[];
  vulnerabilities: CsafVulnerability[];
}

function asString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

function asObject(v: unknown): Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
}

export function parseCsaf(csaf: unknown): ParsedCsaf {
  const root = asObject(csaf);
  const document = asObject(root.document);

  const notes: CsafNote[] = asArray(document.notes).map((n) => {
    const note = asObject(n);
    return {
      title: asString(note.title),
      text: asString(note.text),
      category: asString(note.category),
    };
  });

  const references: CsafReference[] = asArray(document.references).map((r) => {
    const ref = asObject(r);
    return {
      url: asString(ref.url),
      summary: asString(ref.summary),
      category: asString(ref.category),
    };
  });

  const vulnerabilities: CsafVulnerability[] = asArray(
    root.vulnerabilities,
  ).map((v) => {
    const vuln = asObject(v);

    const scores = asArray(vuln.scores);
    const firstScore = asObject(scores[0]);
    const cvssV3 = asObject(firstScore.cvss_v3);
    const severity = cvssV3.baseSeverity ? asString(cvssV3.baseSeverity) : null;

    const vulnNotes = asArray(vuln.notes);
    const summaryNote = vulnNotes
      .map(asObject)
      .find((n) => n.category === "summary");
    const summary = summaryNote ? asString(summaryNote.text) : null;

    const remediations: CsafRemediation[] = asArray(vuln.remediations).map(
      (r) => {
        const rem = asObject(r);
        return {
          category: asString(rem.category),
          details: asString(rem.details),
        };
      },
    );

    return {
      cve: asString(vuln.cve),
      severity,
      summary,
      remediations,
    };
  });

  return { notes, references, vulnerabilities };
}
