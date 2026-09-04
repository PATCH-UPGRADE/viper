// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const prismaMock = {
  notificationDeviceGroupMapping: { upsert: vi.fn() },
  notificationVulnerabilityMapping: { upsert: vi.fn() },
  vulnerability: { findMany: vi.fn() },
};
vi.mock("@/lib/db", () => ({ default: prismaMock }));

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
  return linkEntities(step, notificationId);
};

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.vulnerability.findMany.mockResolvedValue([]);
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
});

describe("the advisory linker", () => {
  it("resolves the device from the channel, not from the prose", async () => {
    await link(RAW, "notif-1");

    expect(resolveMatchingId).toHaveBeenCalledWith({
      manufacturer: "ViperMD",
      product: "ViperDevice",
      version: null,
      versionRange: "vers:semver/<=6.0.2",
      hasCpe: false,
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

  it("links only the vulnerabilities we already hold", async () => {
    prismaMock.vulnerability.findMany.mockResolvedValue([
      { id: "vuln-1", cveId: "CVE-2026-0001" },
    ]);

    const summary = await link(RAW, "notif-1");

    expect(
      prismaMock.notificationVulnerabilityMapping.upsert,
    ).toHaveBeenCalledTimes(1);
    // One device group plus one vulnerability; the unknown CVE is not minted.
    expect(summary).toMatchObject({ linked: 2, created: 0, skipped: 1 });
  });

  it("still links the device when no vulnerability is known", async () => {
    const summary = await link(RAW, "notif-1");

    expect(prismaMock.notificationDeviceGroupMapping.upsert).toHaveBeenCalled();
    expect(
      prismaMock.notificationVulnerabilityMapping.upsert,
    ).not.toHaveBeenCalled();
    expect(summary).toMatchObject({ linked: 1, skipped: 2 });
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
