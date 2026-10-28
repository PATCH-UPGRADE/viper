// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@/generated/prisma";

vi.mock("server-only", () => ({}));

const prismaMock = {
  vulnerabilityIdentifier: { findMany: vi.fn() },
};
vi.mock("@/lib/db", () => ({ default: prismaMock }));

const records = { createVulnerabilityRecord: vi.fn() };
vi.mock("@/features/vulnerabilities/server/records", () => records);

const { normalizeIdentifier, resolveOrMintVulnerabilities } = await import(
  "../vulnerabilities"
);

const resolve = (names: string[]) =>
  resolveOrMintVulnerabilities({
    names,
    deviceGroupMatchingId: "matching-1",
  });

/** One vulnerabilityIdentifier row as findHeld selects it. */
const heldRow = (value: string, vulnerabilityId: string) => ({
  value,
  vulnerabilityId,
});

const uniqueViolation = () =>
  new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
    code: "P2002",
    clientVersion: "test",
  });

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.vulnerabilityIdentifier.findMany.mockResolvedValue([]);
  records.createVulnerabilityRecord.mockImplementation(({ sourceId }) =>
    Promise.resolve({
      record: { id: `record-${sourceId}` },
      vulnerabilityId: `minted-${sourceId}`,
      vulnerabilityCreated: true,
    }),
  );
});

describe("resolveOrMintVulnerabilities", () => {
  it("resolves a held CVE without writing anything", async () => {
    prismaMock.vulnerabilityIdentifier.findMany.mockResolvedValue([
      heldRow("CVE-2026-0001", "vuln-1"),
    ]);

    const { ids, created } = await resolve(["CVE-2026-0001"]);

    expect(ids).toEqual(new Map([["CVE-2026-0001", "vuln-1"]]));
    expect(created).toBe(0);
    expect(records.createVulnerabilityRecord).not.toHaveBeenCalled();
  });

  it("looks identifiers up by their upper-cased value", async () => {
    await resolve(["GHSA-abcd-efgh-ijkl"]);

    expect(prismaMock.vulnerabilityIdentifier.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { value: { in: ["GHSA-ABCD-EFGH-IJKL"] } },
      }),
    );
  });

  it("mints an unknown CVE as an OTHER record on the matching", async () => {
    const { ids, created } = await resolve(["CVE-2026-0002"]);

    expect(records.createVulnerabilityRecord).toHaveBeenCalledWith({
      source: "OTHER",
      sourceId: "CVE-2026-0002",
      identifiers: ["CVE-2026-0002"],
      deviceGroupMatchingIds: ["matching-1"],
      userId: null,
    });
    expect(ids.get("CVE-2026-0002")).toBe("minted-CVE-2026-0002");
    expect(created).toBe(1);
  });

  it("mints an unknown GHSA, keeping its spelling as the identifier", async () => {
    await resolve(["GHSA-abcd-efgh-ijkl"]);

    const [data] = records.createVulnerabilityRecord.mock.calls[0];
    expect(data.sourceId).toBe("GHSA-ABCD-EFGH-IJKL");
    expect(data.identifiers).toEqual(["GHSA-abcd-efgh-ijkl"]);
  });

  it("skips and warns on an identifier that is not a CVE or GHSA ID", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const { ids, created } = await resolve(["VENDOR-7", "CVE-2026-0002"]);

    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("without a CVE or GHSA ID"),
      { name: "VENDOR-7" },
    );
    expect([...ids.keys()]).toEqual(["CVE-2026-0002"]);
    expect(created).toBe(1);
    expect(records.createVulnerabilityRecord).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it("does not count a mint that joined an existing vulnerability", async () => {
    records.createVulnerabilityRecord.mockResolvedValue({
      record: { id: "record-1" },
      vulnerabilityId: "vuln-1",
      vulnerabilityCreated: false,
    });

    const { ids, created } = await resolve(["CVE-2026-0002"]);

    expect(ids.get("CVE-2026-0002")).toBe("vuln-1");
    expect(created).toBe(0);
  });

  it("reads the other run's stub when it loses a race to mint", async () => {
    records.createVulnerabilityRecord.mockRejectedValue(uniqueViolation());
    prismaMock.vulnerabilityIdentifier.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([heldRow("CVE-2026-0003", "winner-1")]);

    const { ids, created } = await resolve(["CVE-2026-0003"]);

    expect(ids.get("CVE-2026-0003")).toBe("winner-1");
    expect(created).toBe(0);
  });

  it("rethrows a lost race when the identifier still cannot be found", async () => {
    const violation = uniqueViolation();
    records.createVulnerabilityRecord.mockRejectedValue(violation);

    await expect(resolve(["CVE-2026-0003"])).rejects.toBe(violation);
  });

  it("rethrows a failure that is not a lost race", async () => {
    records.createVulnerabilityRecord.mockRejectedValue(new Error("db down"));

    await expect(resolve(["CVE-2026-0004"])).rejects.toThrow("db down");
  });

  it("mints one stub for two spellings of one identifier", async () => {
    const { ids, created } = await resolve([
      "cve-2026-0005",
      " CVE-2026-0005 ",
      "GHSA-abcd-efgh-ijkl",
      "ghsa-abcd-efgh-ijkl",
    ]);

    expect(created).toBe(2);
    expect(records.createVulnerabilityRecord).toHaveBeenCalledTimes(2);
    expect(ids).toEqual(
      new Map([
        ["CVE-2026-0005", "minted-CVE-2026-0005"],
        ["GHSA-abcd-efgh-ijkl", "minted-GHSA-ABCD-EFGH-IJKL"],
        ["ghsa-abcd-efgh-ijkl", "minted-GHSA-ABCD-EFGH-IJKL"],
      ]),
    );
  });

  it("does no lookup when there is nothing to resolve", async () => {
    const { ids, created } = await resolve([]);

    expect(ids.size).toBe(0);
    expect(created).toBe(0);
    expect(prismaMock.vulnerabilityIdentifier.findMany).not.toHaveBeenCalled();
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
