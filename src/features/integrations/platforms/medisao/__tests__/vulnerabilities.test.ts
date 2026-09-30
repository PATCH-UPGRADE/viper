// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@/generated/prisma";

vi.mock("server-only", () => ({}));

const prismaMock = {
  vulnerability: { findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
  externalVulnerabilityMapping: { findMany: vi.fn() },
  issue: { createMany: vi.fn() },
};
vi.mock("@/lib/db", () => ({ default: prismaMock }));

const { normalizeIdentifier, resolveOrMintVulnerabilities } = await import(
  "../vulnerabilities"
);

const resolve = (names: string[]) =>
  resolveOrMintVulnerabilities({
    names,
    integrationId: "int-1",
    integrationUserId: "shadow-user",
    deviceGroupMatchingId: "matching-1",
    context: "Named by MedISAO.",
  });

const mintedRow = (
  externalId: string,
  id: string,
  { onMatching }: { onMatching: boolean },
) => ({
  externalId,
  item: {
    id,
    deviceGroupMatchings: onMatching ? [{ id: "matching-1" }] : [],
  },
});

const uniqueViolation = () =>
  new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
    code: "P2002",
    clientVersion: "test",
  });

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.vulnerability.findMany.mockResolvedValue([]);
  prismaMock.externalVulnerabilityMapping.findMany.mockResolvedValue([]);
  prismaMock.vulnerability.create.mockImplementation(({ data }) =>
    Promise.resolve({
      id: `minted-${data.externalMappings.create.externalId}`,
    }),
  );
});

describe("resolveOrMintVulnerabilities", () => {
  it("resolves a held CVE and does not create it again", async () => {
    prismaMock.vulnerability.findMany.mockResolvedValue([
      { id: "vuln-1", cveId: "CVE-2026-0001" },
    ]);

    const { ids, created } = await resolve(["CVE-2026-0001"]);

    expect(ids).toEqual(new Map([["CVE-2026-0001", "vuln-1"]]));
    expect(created).toBe(0);
    expect(prismaMock.vulnerability.create).not.toHaveBeenCalled();
  });

  it("mints an unknown CVE on the matching, with a mapping", async () => {
    const { ids, created } = await resolve(["CVE-2026-0002"]);

    expect(prismaMock.vulnerability.create).toHaveBeenCalledWith({
      data: {
        cveId: "CVE-2026-0002",
        description: null,
        sarif: {},
        userId: "shadow-user",
        deviceGroupMatchings: { connect: [{ id: "matching-1" }] },
        externalMappings: {
          create: { integrationId: "int-1", externalId: "CVE-2026-0002" },
        },
      },
      select: { id: true },
    });
    expect(ids.get("CVE-2026-0002")).toBe("minted-CVE-2026-0002");
    expect(created).toBe(1);
  });

  it("mints a non-CVE identifier as a stub named in its description", async () => {
    await resolve(["GHSA-abcd-efgh-ijkl"]);

    const [{ data }] = prismaMock.vulnerability.create.mock.calls[0];
    expect(data.cveId).toBeNull();
    expect(data.description).toBe("GHSA-abcd-efgh-ijkl. Named by MedISAO.");
  });

  it("finds an earlier stub through its mapping and does not mint it again", async () => {
    prismaMock.externalVulnerabilityMapping.findMany.mockResolvedValue([
      mintedRow("GHSA-abcd-efgh-ijkl", "stub-1", { onMatching: true }),
    ]);

    const { ids, created } = await resolve(["GHSA-abcd-efgh-ijkl"]);

    expect(ids.get("GHSA-abcd-efgh-ijkl")).toBe("stub-1");
    expect(created).toBe(0);
    expect(prismaMock.vulnerability.create).not.toHaveBeenCalled();
    expect(prismaMock.vulnerability.update).not.toHaveBeenCalled();
    expect(prismaMock.issue.createMany).not.toHaveBeenCalled();
  });

  it("attaches its own earlier row to a second channel, with an Issue", async () => {
    prismaMock.externalVulnerabilityMapping.findMany.mockResolvedValue([
      mintedRow("CVE-2026-0001", "minted-1", { onMatching: false }),
    ]);

    const { ids, created } = await resolve(["CVE-2026-0001"]);

    expect(ids.get("CVE-2026-0001")).toBe("minted-1");
    expect(created).toBe(0);
    expect(prismaMock.vulnerability.update).toHaveBeenCalledWith({
      where: { id: "minted-1" },
      data: { deviceGroupMatchings: { connect: [{ id: "matching-1" }] } },
    });
    expect(prismaMock.issue.createMany).toHaveBeenCalledWith({
      data: [
        { vulnerabilityId: "minted-1", deviceGroupMatchingId: "matching-1" },
      ],
      skipDuplicates: true,
    });
  });

  it("treats its own CVE as minted, even though the cveId lookup finds it", async () => {
    prismaMock.externalVulnerabilityMapping.findMany.mockResolvedValue([
      mintedRow("CVE-2026-0001", "minted-1", { onMatching: false }),
    ]);
    prismaMock.vulnerability.findMany.mockResolvedValue([
      { id: "minted-1", cveId: "CVE-2026-0001" },
    ]);

    const { ids } = await resolve(["CVE-2026-0001"]);

    expect(ids.get("CVE-2026-0001")).toBe("minted-1");
    expect(prismaMock.vulnerability.update).toHaveBeenCalled();
  });

  it("links a CVE another source holds but leaves its matchings alone", async () => {
    prismaMock.vulnerability.findMany.mockResolvedValue([
      { id: "vuln-1", cveId: "CVE-2026-0001" },
    ]);

    await resolve(["CVE-2026-0001"]);

    expect(prismaMock.vulnerability.update).not.toHaveBeenCalled();
    expect(prismaMock.issue.createMany).not.toHaveBeenCalled();
  });

  it("reads the other run's row when it loses a race to mint", async () => {
    prismaMock.vulnerability.create.mockRejectedValue(uniqueViolation());
    prismaMock.externalVulnerabilityMapping.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        mintedRow("CVE-2026-0003", "winner-1", { onMatching: false }),
      ]);

    const { ids, created } = await resolve(["CVE-2026-0003"]);

    expect(ids.get("CVE-2026-0003")).toBe("winner-1");
    expect(created).toBe(0);
    // The winner can have minted it for another channel.
    expect(prismaMock.issue.createMany).toHaveBeenCalledWith({
      data: [
        { vulnerabilityId: "winner-1", deviceGroupMatchingId: "matching-1" },
      ],
      skipDuplicates: true,
    });
  });

  it("rethrows a failure that is not a lost race", async () => {
    prismaMock.vulnerability.create.mockRejectedValue(new Error("db down"));

    await expect(resolve(["CVE-2026-0004"])).rejects.toThrow("db down");
  });

  it("mints one row for two spellings of one CVE", async () => {
    const { ids, created } = await resolve([
      "cve-2026-0005",
      " CVE-2026-0005 ",
    ]);

    expect(created).toBe(1);
    expect([...ids.keys()]).toEqual(["CVE-2026-0005"]);
  });

  it("does no lookup when there is nothing to resolve", async () => {
    const { ids, created } = await resolve([]);

    expect(ids.size).toBe(0);
    expect(created).toBe(0);
    expect(prismaMock.vulnerability.findMany).not.toHaveBeenCalled();
    expect(
      prismaMock.externalVulnerabilityMapping.findMany,
    ).not.toHaveBeenCalled();
  });
});

describe("normalizeIdentifier", () => {
  it("upper-cases a CVE and leaves any other identifier as sent", () => {
    expect(normalizeIdentifier("cve-2026-0001")).toBe("CVE-2026-0001");
    expect(normalizeIdentifier(" GHSA-abcd-efgh-ijkl ")).toBe(
      "GHSA-abcd-efgh-ijkl",
    );
  });
});
