import "server-only";
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

async function fetchEpss(cveId: string): Promise<number | null> {
  const res = await fetch(
    `https://api.first.org/data/v1/epss?cve=${encodeURIComponent(cveId)}`,
    { signal: AbortSignal.timeout(15000) },
  );
  if (!res.ok) return null;

  const json = (await res.json()) as {
    data?: { epss?: string | number }[];
  };
  const entry = json.data?.[0];
  if (entry?.epss === undefined || entry?.epss === null) return null;

  const score = Number(entry.epss);
  return Number.isNaN(score) ? null : score;
}

// Pure fetcher — no module-level state. Returns uppercase CVE IDs.
async function fetchKevSet(): Promise<Set<string>> {
  const res = await fetch(
    "https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json",
    { signal: AbortSignal.timeout(30000) },
  );
  if (!res.ok) return new Set();

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
      return prisma.vulnerability.findUnique({
        where: { id: vulnerabilityId },
        select: { id: true, cveId: true, cvssScore: true },
      });
    });

    if (!vulnerability || !vulnerability.cveId) {
      return { skipped: true, reason: "no CVE ID" };
    }

    const cveId = vulnerability.cveId;

    const epss = await step.run("lookup-epss", () => fetchEpss(cveId));

    // Batch path: use the pre-fetched set from the event payload (no network call).
    // Standalone path: fetch the KEV feed once for this single invocation.
    const inKEV: boolean =
      kevIds !== undefined
        ? new Set(kevIds).has(cveId.toUpperCase())
        : await step.run("lookup-kev", async () => {
            const kevSet = await fetchKevSet();
            return kevSet.has(cveId.toUpperCase());
          });

    const priority = computeVulnerabilityPriority(
      epss,
      vulnerability.cvssScore,
      inKEV,
    );

    await step.run("update-vulnerability", async () => {
      const now = new Date();
      await prisma.vulnerability.update({
        where: { id: vulnerability.id },
        data: {
          epss,
          updatedEpss: now,
          inKEV,
          updatedInKev: now,
          priority,
        },
      });
    });

    return { enriched: true, cveId, epss, inKEV, priority };
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
          where: { cveId: { not: null } },
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
