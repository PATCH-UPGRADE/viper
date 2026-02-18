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

const KEV_CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

interface KevCache {
  ids: Set<string>;
  fetchedAt: number;
}

let kevCache: KevCache | null = null;

async function fetchKevSet(): Promise<Set<string>> {
  const now = Date.now();
  if (kevCache && now - kevCache.fetchedAt < KEV_CACHE_TTL_MS) {
    return kevCache.ids;
  }

  const res = await fetch(
    "https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json",
    { signal: AbortSignal.timeout(30000) },
  );

  if (!res.ok) {
    // Return stale cache rather than treating every CVE as not in KEV.
    if (kevCache) return kevCache.ids;
    return new Set();
  }

  const json = (await res.json()) as {
    vulnerabilities?: { cveID?: string }[];
  };

  const ids = new Set(
    (json.vulnerabilities ?? [])
      .map((v) => v.cveID?.toUpperCase())
      .filter((id): id is string => Boolean(id)),
  );

  kevCache = { ids, fetchedAt: now };
  return ids;
}

async function fetchKevStatus(cveId: string): Promise<boolean> {
  const kevSet = await fetchKevSet();
  return kevSet.has(cveId.toUpperCase());
}

export const enrichVulnerability = inngest.createFunction(
  { id: "enrich-vulnerability" },
  { event: "vulnerability/enrich.requested" },
  async ({ event, step }) => {
    const { vulnerabilityId } = event.data;

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

    const inKEV = await step.run("lookup-kev", () => fetchKevStatus(cveId));

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
          inKEV: inKEV,
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
    const vulnerabilities = await step.run(
      "fetch-vulnerabilities-with-cve",
      async () => {
        return prisma.vulnerability.findMany({
          where: { cveId: { not: null } },
          select: { id: true },
        });
      },
    );

    if (vulnerabilities.length === 0) {
      return { enrichedCount: 0 };
    }

    await step.sendEvent(
      "trigger-enrichments",
      vulnerabilities.map((v) => ({
        name: "vulnerability/enrich.requested" as const,
        data: { vulnerabilityId: v.id },
      })),
    );

    return { enrichedCount: vulnerabilities.length };
  },
);
