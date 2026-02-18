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
  if (!epss || !cvssScore)
    return "Unsorted";
  if (inKEV) {
    if (cvssScore >= 7.0)
      return "Critical"
    return "Monitor"
  } 
  else {
    if (epss >= 0.088) {
      if (cvssScore >= 7.0)
        return "High"
      return "Monitor"
    }
    return "Defer" // not in KEV, epss < 0.088
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
  if (!entry?.epss) return null;

  const score = Number(entry.epss);
  return Number.isNaN(score) ? null : score;
}

async function fetchKevStatus(cveId: string): Promise<boolean> {
  const res = await fetch(
    "https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json",
    { signal: AbortSignal.timeout(30000) },
  );
  if (!res.ok) return false;

  const json = (await res.json()) as {
    vulnerabilities?: { cveID?: string }[];
  };
  return (
    json.vulnerabilities?.some(
      (v) => v.cveID?.toUpperCase() === cveId.toUpperCase(),
    ) ?? false
  );
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
