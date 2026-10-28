// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const prismaMock = {
  notificationDeviceGroupMapping: { upsert: vi.fn() },
  notificationVulnerabilityMapping: {
    createMany: vi.fn(),
    updateMany: vi.fn(),
  },
  vulnerabilityIdentifier: { findMany: vi.fn() },
};
vi.mock("@/lib/db", () => ({ default: prismaMock }));

const createVulnerabilityRecord = vi.fn();
vi.mock("@/features/vulnerabilities/server/records", () => ({
  createVulnerabilityRecord: (...args: unknown[]) =>
    createVulnerabilityRecord(...args),
}));

/** A vulnerabilityIdentifier row for a vulnerability Viper already holds. */
const heldRow = (value: string, vulnerabilityId: string) => ({
  value,
  vulnerabilityId,
});

const resolveMatchingId = vi.fn();
vi.mock("@/lib/router-utils", () => ({
  resolveMatchingId: (...args: unknown[]) => resolveMatchingId(...args),
}));

const { advisorySourceAdapter } = await import(
  "../advisories/notification-source"
);

const RAW = {
  id: "adv-1",
  channel: { vendor: "ViperMD", product: "ViperDevice" },
  name: "Buffer overflow in the pump driver",
  description: "A crafted packet crashes the driver.",
  version: "vers:semver/<=6.0.2",
  version_text: null,
  tlp: "CLEAR",
  linked_vulnerabilities: ["CVE-2026-0001", "CVE-2026-0002"],
  source_type: "manual",
  url: "",
  published_at: "2026-08-14T03:04:48.479560Z",
  updated_at: "2026-08-14T03:04:48.479712Z",
};

const step = { run: <T>(_id: string, fn: () => Promise<T>) => fn() };

const link = (raw: unknown, notificationId: string | null) => {
  // biome-ignore lint/suspicious/noExplicitAny: the step tools are stubbed
  const { linkEntities } = advisorySourceAdapter.prepare(raw) as any;
  return linkEntities(step, notificationId, { sourceId: "source-1" });
};

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.vulnerabilityIdentifier.findMany.mockResolvedValue([]);
  createVulnerabilityRecord.mockImplementation(({ sourceId }) =>
    Promise.resolve({
      record: { id: `record-${sourceId}` },
      vulnerabilityId: `minted-${sourceId}`,
      vulnerabilityCreated: true,
    }),
  );
  resolveMatchingId.mockResolvedValue("matching-1");
});

describe("the advisory document", () => {
  it("names MedISAO as the sender and the advisory as the subject", () => {
    const { doc } = advisorySourceAdapter.prepare(RAW);
    expect(doc.from).toBe("MedISAO");
    expect(doc.subject).toBe("Buffer overflow in the pump driver");
    expect(doc.markdown).toContain("A crafted packet crashes the driver.");
  });

  it("refuses a payload that is not an advisory", () => {
    expect(() => advisorySourceAdapter.prepare({ nonsense: true })).toThrow();
  });

  it("states the TLP marking rather than leaving it to the classifier", () => {
    const { known } = advisorySourceAdapter.prepare(RAW);
    expect(known?.tlp).toBe("CLEAR");
  });

  it("states no marking when MedISAO sends one we do not recognise", () => {
    const { known } = advisorySourceAdapter.prepare({ ...RAW, tlp: "PUCE" });
    expect(known?.tlp).toBeUndefined();
  });
});

describe("the advisory linker", () => {
  it("resolves the device from the channel, not from the prose", async () => {
    await link(RAW, "notif-1");

    expect(resolveMatchingId).toHaveBeenCalledWith({
      manufacturer: "ViperMD",
      product: "ViperDevice",
      version: null,
      versionRange: "vers:semver/<=6.0.2",
    });
  });

  it("links the device group and says why", async () => {
    await link(RAW, "notif-1");

    const [args] = prismaMock.notificationDeviceGroupMapping.upsert.mock.calls;
    expect(args[0].create).toMatchObject({
      notificationId: "notif-1",
      deviceGroupMatchingId: "matching-1",
      confidence: "Matched",
    });
    expect(args[0].create.reasonWhy).toContain("ViperMD ViperDevice channel");
  });

  it("never claims a human confirmed the link", async () => {
    await link(RAW, "notif-1");

    const [args] = prismaMock.notificationDeviceGroupMapping.upsert.mock.calls;
    expect(args[0].create.confidence).not.toBe("Confirmed");
  });

  it("links a held vulnerability and mints the one Viper lacks", async () => {
    prismaMock.vulnerabilityIdentifier.findMany.mockResolvedValue([
      heldRow("CVE-2026-0001", "vuln-1"),
    ]);

    const summary = await link(RAW, "notif-1");

    expect(createVulnerabilityRecord).toHaveBeenCalledTimes(1);
    expect(createVulnerabilityRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "OTHER",
        sourceId: "CVE-2026-0002",
        deviceGroupMatchingIds: ["matching-1"],
      }),
    );
    const [[{ data: links, skipDuplicates }]] =
      prismaMock.notificationVulnerabilityMapping.createMany.mock.calls;
    expect(skipDuplicates).toBe(true);
    expect(
      links
        .map((link: { vulnerabilityId: string }) => link.vulnerabilityId)
        .sort(),
    ).toEqual(["minted-CVE-2026-0002", "vuln-1"]);
    expect(summary).toMatchObject({ linked: 2, created: 1, skipped: 0 });
  });

  it("raises only a NeedsReview link, so a human's confidence stays", async () => {
    prismaMock.vulnerabilityIdentifier.findMany.mockResolvedValue([
      heldRow("CVE-2026-0001", "vuln-1"),
    ]);

    await link(RAW, "notif-1");

    expect(
      prismaMock.notificationVulnerabilityMapping.updateMany,
    ).toHaveBeenCalledWith({
      where: {
        notificationId: "notif-1",
        vulnerabilityId: { in: expect.arrayContaining(["vuln-1"]) },
        confidence: "NeedsReview",
      },
      data: { confidence: "Matched" },
    });
  });

  it("links only the device when the advisory names no vulnerability", async () => {
    const summary = await link(
      { ...RAW, linked_vulnerabilities: [] },
      "notif-1",
    );

    expect(prismaMock.notificationDeviceGroupMapping.upsert).toHaveBeenCalled();
    expect(createVulnerabilityRecord).not.toHaveBeenCalled();
    expect(
      prismaMock.notificationVulnerabilityMapping.createMany,
    ).not.toHaveBeenCalled();
    expect(summary).toMatchObject({ linked: 1, created: 0 });
  });

  it("writes nothing when the classifier produced no notification", async () => {
    const summary = await link(RAW, null);

    expect(resolveMatchingId).not.toHaveBeenCalled();
    expect(
      prismaMock.notificationDeviceGroupMapping.upsert,
    ).not.toHaveBeenCalled();
    expect(summary).toMatchObject({ linked: 0, skipped: 0 });
  });
});
