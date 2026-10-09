// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import {
  computeDisplayId,
  findVulnerabilityByIdentifiers,
  mintViperIdentifier,
  normalizeIdentifier,
  normalizeIdentifiers,
  upsertIdentifiers,
} from "../identity";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ default: {} }));

type Row = { value: string; displayValue?: string; vulnerabilityId: string };

/**
 * An in-memory vulnerabilityIdentifier table with the unique `value` constraint, kept in
 * insertion (createdAt) order.
 */
function fakeClient(rows: Row[] = []) {
  const table = rows.map((row) => ({
    displayValue: row.value,
    ...row,
  }));
  const vulnerabilityIdentifier = {
    findMany: vi.fn(
      async ({
        where,
      }: {
        where: {
          value?: { in: string[] };
          vulnerabilityId?: string | { not: string };
        };
      }) =>
        table.filter(
          (row) =>
            (!where.value || where.value.in.includes(row.value)) &&
            (where.vulnerabilityId === undefined ||
              (typeof where.vulnerabilityId === "string"
                ? row.vulnerabilityId === where.vulnerabilityId
                : row.vulnerabilityId !== where.vulnerabilityId.not)),
        ),
    ),
    createMany: vi.fn(async ({ data }: { data: Required<Row>[] }) => {
      for (const row of data) {
        if (!table.some((existing) => existing.value === row.value)) {
          table.push(row);
        }
      }
    }),
  };
  const vulnerability = { updateMany: vi.fn(async () => ({ count: 1 })) };
  return {
    // biome-ignore lint/suspicious/noExplicitAny: a partial fake of the Prisma delegates
    client: { vulnerabilityIdentifier, vulnerability } as any,
    table,
  };
}

describe("normalizeIdentifier", () => {
  it("upper-cases the lookup value and keeps the published spelling for display", () => {
    expect(normalizeIdentifier("  GHSA-jfh8-c2jp-5v3q ")).toEqual({
      value: "GHSA-JFH8-C2JP-5V3Q",
      displayValue: "GHSA-jfh8-c2jp-5v3q",
    });
  });

  it("upper-cases a CVE for display too", () => {
    expect(normalizeIdentifier("cve-2024-1234")).toEqual({
      value: "CVE-2024-1234",
      displayValue: "CVE-2024-1234",
    });
  });

  it("drops a blank identifier", () => {
    expect(normalizeIdentifier("   ")).toBeNull();
  });
});

describe("normalizeIdentifiers", () => {
  it("drops blanks and keeps the first spelling of a repeated value", () => {
    expect(
      normalizeIdentifiers(["GHSA-abcd-efgh-ijkl", "", "GHSA-ABCD-EFGH-IJKL"]),
    ).toEqual([
      { value: "GHSA-ABCD-EFGH-IJKL", displayValue: "GHSA-abcd-efgh-ijkl" },
    ]);
  });
});

describe("computeDisplayId", () => {
  const ids = (...raws: string[]) => normalizeIdentifiers(raws);

  it("prefers a CVE, then a GHSA, then another ID, then a VIPER ID", () => {
    expect(
      computeDisplayId(
        ids("VIPER-ABC", "BD:2024-001", "GHSA-abcd-efgh-ijkl", "CVE-2024-1234"),
      ),
    ).toBe("CVE-2024-1234");
    expect(
      computeDisplayId(ids("VIPER-ABC", "BD:2024-001", "GHSA-abcd-efgh-ijkl")),
    ).toBe("GHSA-abcd-efgh-ijkl");
    expect(computeDisplayId(ids("VIPER-ABC", "BD:2024-001"))).toBe(
      "BD:2024-001",
    );
    expect(computeDisplayId(ids("VIPER-ABC"))).toBe("VIPER-ABC");
  });

  it("keeps the earlier of two IDs of the same kind", () => {
    expect(computeDisplayId(ids("CVE-2024-0002", "CVE-2024-0001"))).toBe(
      "CVE-2024-0002",
    );
  });

  it("is null for a vulnerability with no identifiers", () => {
    expect(computeDisplayId([])).toBeNull();
  });
});

describe("mintViperIdentifier", () => {
  it("mints a distinct VIPER- ID each time", () => {
    const first = mintViperIdentifier();
    expect(first.value).toMatch(/^VIPER-[0-9A-F]{12}$/);
    expect(first.displayValue).toBe(first.value);
    expect(mintViperIdentifier().value).not.toBe(first.value);
  });
});

describe("findVulnerabilityByIdentifiers", () => {
  it("finds the vulnerability any of the identifiers belongs to", async () => {
    const { client } = fakeClient([
      { value: "CVE-2024-1234", vulnerabilityId: "v-1" },
    ]);
    await expect(
      findVulnerabilityByIdentifiers(client, ["GHSA-X", "CVE-2024-1234"]),
    ).resolves.toBe("v-1");
  });

  it("is null when none of them is known", async () => {
    const { client } = fakeClient();
    await expect(
      findVulnerabilityByIdentifiers(client, ["CVE-2024-1234"]),
    ).resolves.toBeNull();
  });

  it("does not query for an empty list", async () => {
    const { client } = fakeClient();
    await expect(
      findVulnerabilityByIdentifiers(client, []),
    ).resolves.toBeNull();
    expect(client.vulnerabilityIdentifier.findMany).not.toHaveBeenCalled();
  });

  it("throws CONFLICT when the identifiers belong to two vulnerabilities", async () => {
    const { client } = fakeClient([
      { value: "CVE-2024-1234", vulnerabilityId: "v-1" },
      { value: "GHSA-X", vulnerabilityId: "v-2" },
    ]);
    await expect(
      findVulnerabilityByIdentifiers(client, ["CVE-2024-1234", "GHSA-X"]),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });
});

describe("upsertIdentifiers", () => {
  it("adds new identifiers and leaves ones the vulnerability already has", async () => {
    const { client, table } = fakeClient([
      { value: "CVE-2024-1234", vulnerabilityId: "v-1" },
    ]);
    await upsertIdentifiers(
      client,
      "v-1",
      normalizeIdentifiers(["CVE-2024-1234", "GHSA-abcd-efgh-ijkl"]),
    );
    expect(table.map((row) => row.value)).toEqual([
      "CVE-2024-1234",
      "GHSA-ABCD-EFGH-IJKL",
    ]);
  });

  it("recomputes displayId when a better identifier arrives", async () => {
    const { client } = fakeClient([
      { value: "VIPER-ABC", vulnerabilityId: "v-1" },
    ]);
    await upsertIdentifiers(
      client,
      "v-1",
      normalizeIdentifiers(["GHSA-abcd-efgh-ijkl", "CVE-2024-1234"]),
    );
    expect(client.vulnerability.updateMany).toHaveBeenCalledWith({
      where: { id: "v-1", displayId: { not: "CVE-2024-1234" } },
      data: { displayId: "CVE-2024-1234" },
    });
  });

  it("throws CONFLICT for an identifier another vulnerability holds", async () => {
    const { client } = fakeClient([
      { value: "CVE-2024-1234", vulnerabilityId: "v-2" },
    ]);
    await expect(
      upsertIdentifiers(client, "v-1", normalizeIdentifiers(["CVE-2024-1234"])),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });
});
