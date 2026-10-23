// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@/generated/prisma";

vi.mock("server-only", () => ({}));

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    vulnerability: { findMany: vi.fn() },
    remediation: { findMany: vi.fn() },
  },
}));

vi.mock("@/lib/db", () => ({ default: mockPrisma }));

import { searchCandidates } from "./candidate-search";

const cvss = (score: number, updatedAt: string, vector: string | null) => ({
  id: `m-${score}`,
  recordId: "rec",
  type: "CVSS_V3_1" as const,
  vector,
  score: new Prisma.Decimal(score),
  percentile: null,
  severity: null,
  flag: null,
  createdAt: new Date(updatedAt),
  updatedAt: new Date(updatedAt),
});

const empty = {
  deviceGroups: [],
  vulnerabilities: [],
  remediations: [],
  assets: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.vulnerability.findMany.mockResolvedValue([]);
  mockPrisma.remediation.findMany.mockResolvedValue([]);
});

describe("searchCandidates — vulnerabilities", () => {
  it("finds a vulnerability by its normalized CVE identifier", async () => {
    await searchCandidates({
      ...empty,
      vulnerabilities: [{ cveId: " cve-2026-0001 " }],
    });

    expect(mockPrisma.vulnerability.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { identifiers: { some: { value: "CVE-2026-0001" } } },
      }),
    );
  });

  it("returns the display ID and the newest CVSS across its records", async () => {
    mockPrisma.vulnerability.findMany.mockResolvedValue([
      {
        id: "vuln-1",
        displayId: "CVE-2026-0001",
        description: null,
        records: [
          { metrics: [cvss(6.1, "2026-01-01", "CVSS:3.1/AV:L")] },
          { metrics: [cvss(9.8, "2026-06-01", "CVSS:3.1/AV:N")] },
        ],
      },
    ]);

    const { vulnerabilities } = await searchCandidates({
      ...empty,
      vulnerabilities: [{ cveId: "CVE-2026-0001" }],
    });

    expect(vulnerabilities[0].matches).toEqual([
      {
        id: "vuln-1",
        displayId: "CVE-2026-0001",
        description: null,
        cvssScore: 9.8,
        cvssVector: "CVSS:3.1/AV:N",
      },
    ]);
  });

  it("doesn't search without a CVE", async () => {
    const { vulnerabilities } = await searchCandidates({
      ...empty,
      vulnerabilities: [{ cvssScore: 5 }],
    });

    expect(vulnerabilities[0].matches).toEqual([]);
    expect(mockPrisma.vulnerability.findMany).not.toHaveBeenCalled();
  });
});

describe("searchCandidates — remediations", () => {
  it("matches linked CVEs through identifiers and lists them from display IDs", async () => {
    mockPrisma.remediation.findMany.mockResolvedValue([
      {
        id: "rem-1",
        description: "Patch",
        vulnerabilities: [
          { displayId: "CVE-2026-0001" },
          { displayId: "VIPER-ABC123" },
        ],
        deviceGroupMatchings: [],
      },
    ]);

    const { remediations } = await searchCandidates({
      ...empty,
      remediations: [{ linkedCveIds: ["cve-2026-0001"] }],
    });

    expect(mockPrisma.remediation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          OR: [
            {
              vulnerabilities: {
                some: {
                  identifiers: { some: { value: { in: ["CVE-2026-0001"] } } },
                },
              },
            },
          ],
        },
      }),
    );
    expect(remediations[0].matches[0].linkedCveIds).toEqual(["CVE-2026-0001"]);
  });
});
