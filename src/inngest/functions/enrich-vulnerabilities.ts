import "server-only";
import { upsertFeedRecord } from "@/features/vulnerabilities/server/feed-records";
import { CVE_PREFIX } from "@/features/vulnerabilities/server/identity";
import { CVSS_METRIC_TYPES } from "@/features/vulnerabilities/server/records";
import type { Priority } from "@/generated/prisma";
import prisma from "@/lib/db";
import { inngest } from "../client";

export function computeVulnerabilityPriority(
  epss: number | null,
  cvssScore: number | null,
  inKEV: boolean,
): Priority {
  // See this paper https://arxiv.org/pdf/2506.01220#figure.1
  if (epss === null || cvssScore === null) return "Unsorted";
  if (inKEV) {
    if (cvssScore >= 7.0) return "Critical";
    return "Monitor";
  } else {
    if (epss >= 0.088) {
      if (cvssScore >= 7.0) return "High";
      return "Monitor";
    }
    return "Defer"; // not in KEV, epss < 0.088
  }
}

interface EpssEntry {
  cve?: string;
  epss?: string | number;
  percentile?: string | number;
  date?: string;
}

/** FIRST's score for a CVE, or null when FIRST has none. Throws on a failed request, to retry. */
async function fetchEpss(cve: string) {
  const res = await fetch(
    `https://api.first.org/data/v1/epss?cve=${encodeURIComponent(cve)}`,
    { signal: AbortSignal.timeout(15000) },
  );
  if (!res.ok) throw new Error(`FIRST EPSS request failed: ${res.status}`);

  const json = (await res.json()) as { data?: EpssEntry[] };
  const entry = json.data?.[0];
  if (entry?.epss === undefined || entry?.epss === null) return null;

  const score = Number(entry.epss);
  if (Number.isNaN(score)) return null;
  const percentile = Number(entry.percentile);
  return {
    score,
    percentile: Number.isNaN(percentile) ? null : percentile,
    raw: entry,
  };
}

// Pure fetcher — no module-level state. Returns uppercase CVE IDs. Throws on a failed request:
// an empty set would mark every CVE as not in KEV.
async function fetchKevSet(): Promise<Set<string>> {
  const res = await fetch(
    "https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json",
    { signal: AbortSignal.timeout(30000) },
  );
  if (!res.ok) throw new Error(`CISA KEV feed request failed: ${res.status}`);

  const json = (await res.json()) as {
    vulnerabilities?: { cveID?: string }[];
  };

  return new Set(
    (json.vulnerabilities ?? [])
      .map((v) => v.cveID?.toUpperCase())
      .filter((id): id is string => Boolean(id)),
  );
}

export const enrichVulnerability = inngest.createFunction(
  { id: "enrich-vulnerability" },
  { event: "vulnerability/enrich.requested" },
  async ({ event, step }) => {
    // kevIds is present when triggered from enrichAllVulnerabilities (batch path).
    // It is absent when the event is dispatched directly (standalone path).
    const { vulnerabilityId, kevIds } = event.data as {
      vulnerabilityId: string;
      kevIds?: string[];
    };

    const vulnerability = await step.run("fetch-vulnerability", async () => {
      const row = await prisma.vulnerability.findUnique({
        where: { id: vulnerabilityId },
        select: {
          id: true,
          // The oldest CVE identifier, not displayId: displayId is a display choice whose rules
          // may change, while the CVE identifier is stable, and the feeds are keyed by CVE.
          identifiers: {
            where: { value: { startsWith: CVE_PREFIX } },
            orderBy: { createdAt: "asc" },
            take: 1,
            select: { value: true },
          },
        },
      });
      if (!row) return null;
      // Newest CVSS wins, the same rule as the vulnerability's severity.
      const cvss = await prisma.metric.findFirst({
        where: {
          record: { vulnerabilityId },
          type: { in: CVSS_METRIC_TYPES },
          score: { not: null },
        },
        orderBy: { updatedAt: "desc" },
        select: { score: true },
      });
      return {
        id: row.id,
        cve: row.identifiers[0]?.value ?? null,
        // Decimal doesn't survive the step boundary.
        cvssScore: cvss?.score?.toNumber() ?? null,
      };
    });

    if (!vulnerability || !vulnerability.cve) {
      return { skipped: true, reason: "no CVE ID" };
    }

    const { cve } = vulnerability;

    const epss = await step.run("lookup-epss", () => fetchEpss(cve));

    // Batch path: use the pre-fetched set from the event payload (no network call).
    // Standalone path: fetch the KEV feed once for this single invocation.
    const inKEV: boolean =
      kevIds !== undefined
        ? new Set(kevIds).has(cve)
        : await step.run("lookup-kev", async () => {
            const kevSet = await fetchKevSet();
            return kevSet.has(cve);
          });

    const priority = computeVulnerabilityPriority(
      epss?.score ?? null,
      vulnerability.cvssScore,
      inKEV,
    );

    await step.run("write-feed-records", async () => {
      // When FIRST has no score, the EPSS record and column keep their last value.
      if (epss) {
        await upsertFeedRecord({
          vulnerabilityId: vulnerability.id,
          cve,
          metric: {
            source: "FIRST_EPSS",
            score: epss.score,
            percentile: epss.percentile,
          },
          raw: epss.raw,
        });
      }
      await upsertFeedRecord({
        vulnerabilityId: vulnerability.id,
        cve,
        metric: { source: "CISA_KEV", inKev: inKEV },
      });

      // TODO: VW-540 legacy columns, still read by the UI, entity filters and the inbox.
      // TODO: VW-541 priority moves to Issue.
      const now = new Date();
      await prisma.vulnerability.update({
        where: { id: vulnerability.id },
        data: {
          ...(epss ? { epss: epss.score, updatedEpss: now } : {}),
          inKEV,
          updatedInKev: now,
          priority,
        },
      });
    });

    return { enriched: true, cve, epss: epss?.score ?? null, inKEV, priority };
  },
);

export const enrichAllVulnerabilities = inngest.createFunction(
  { id: "enrich-all-vulnerabilities" },
  { cron: "0 2 * * *" },
  async ({ step }) => {
    // Fetch the vulnerability list and the KEV feed in parallel.
    // fetchKevSet runs exactly once per batch regardless of how many CVEs exist.
    const [vulnerabilities, kevIds] = await Promise.all([
      step.run("fetch-vulnerabilities-with-cve", () =>
        prisma.vulnerability.findMany({
          where: {
            identifiers: { some: { value: { startsWith: CVE_PREFIX } } },
          },
          select: { id: true },
        }),
      ),
      step.run("fetch-kev-set", async () => {
        const kevSet = await fetchKevSet();
        return Array.from(kevSet);
      }),
    ]);

    if (vulnerabilities.length === 0) {
      return { enrichedCount: 0 };
    }

    await step.sendEvent(
      "trigger-enrichments",
      vulnerabilities.map((v) => ({
        name: "vulnerability/enrich.requested" as const,
        data: { vulnerabilityId: v.id, kevIds },
      })),
    );

    return { enrichedCount: vulnerabilities.length };
  },
);
