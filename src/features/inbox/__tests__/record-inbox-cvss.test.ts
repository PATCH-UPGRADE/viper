// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { mockPrisma, upsertSourceRecord } = vi.hoisted(() => ({
  mockPrisma: { metric: { count: vi.fn() } },
  upsertSourceRecord: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ default: mockPrisma }));
vi.mock("@/features/vulnerabilities/server/records", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("@/features/vulnerabilities/server/records")
    >();
  return { cvssMetricType: actual.cvssMetricType, upsertSourceRecord };
});

const { recordInboxCvss } = await import("../utils");

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.metric.count.mockResolvedValue(0);
});

describe("recordInboxCvss", () => {
  it("keeps the score as an INBOX record keyed by the notification", async () => {
    await recordInboxCvss({
      vulnerabilityId: "vuln-1",
      notificationId: "notif-1",
      cvssScore: 9.1,
      cvssVector:
        "CVSS:4.0/AV:N/AC:L/AT:N/PR:N/UI:N/VC:H/VI:H/VA:H/SC:N/SI:N/SA:N",
    });

    expect(upsertSourceRecord).toHaveBeenCalledWith("vuln-1", {
      source: "INBOX",
      sourceId: "notif-1",
      metrics: [
        {
          type: "CVSS_V4_0",
          score: 9.1,
          vector:
            "CVSS:4.0/AV:N/AC:L/AT:N/PR:N/UI:N/VC:H/VI:H/VA:H/SC:N/SI:N/SA:N",
        },
      ],
    });
  });

  it("assumes CVSS 3.1 for a score with no vector", async () => {
    await recordInboxCvss({
      vulnerabilityId: "vuln-1",
      notificationId: "notif-1",
      cvssScore: 7.5,
    });

    expect(upsertSourceRecord).toHaveBeenCalledWith(
      "vuln-1",
      expect.objectContaining({
        metrics: [{ type: "CVSS_V3_1", score: 7.5, vector: null }],
      }),
    );
  });

  it("writes nothing without a score or a vector", async () => {
    await recordInboxCvss({
      vulnerabilityId: "vuln-1",
      notificationId: "notif-1",
      cvssScore: null,
    });

    expect(mockPrisma.metric.count).not.toHaveBeenCalled();
    expect(upsertSourceRecord).not.toHaveBeenCalled();
  });

  it("skips a score and vector some record already has", async () => {
    mockPrisma.metric.count.mockResolvedValue(1);

    await recordInboxCvss({
      vulnerabilityId: "vuln-1",
      notificationId: "notif-1",
      cvssScore: 8.1,
      cvssVector: "CVSS:3.1/AV:A/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:N",
    });

    expect(mockPrisma.metric.count).toHaveBeenCalledWith({
      where: {
        record: { vulnerabilityId: "vuln-1" },
        type: { in: ["CVSS_V3_0", "CVSS_V3_1", "CVSS_V4_0"] },
        score: 8.1,
        vector: "CVSS:3.1/AV:A/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:N",
      },
    });
    expect(upsertSourceRecord).not.toHaveBeenCalled();
  });

  it("compares only the score when the notification gives no vector", async () => {
    mockPrisma.metric.count.mockResolvedValue(1);

    await recordInboxCvss({
      vulnerabilityId: "vuln-1",
      notificationId: "notif-1",
      cvssScore: 8.1,
    });

    expect(mockPrisma.metric.count).toHaveBeenCalledWith({
      where: {
        record: { vulnerabilityId: "vuln-1" },
        type: { in: ["CVSS_V3_0", "CVSS_V3_1", "CVSS_V4_0"] },
        score: 8.1,
      },
    });
    expect(upsertSourceRecord).not.toHaveBeenCalled();
  });

  it("records a score that differs from the vulnerability's existing CVSS", async () => {
    // No metric with this score: the vulnerability's TA3 CVSS says something else.
    mockPrisma.metric.count.mockResolvedValue(0);

    await recordInboxCvss({
      vulnerabilityId: "vuln-1",
      notificationId: "notif-1",
      cvssScore: 7.5,
    });

    expect(upsertSourceRecord).toHaveBeenCalledWith(
      "vuln-1",
      expect.objectContaining({
        source: "INBOX",
        sourceId: "notif-1",
        metrics: [{ type: "CVSS_V3_1", score: 7.5, vector: null }],
      }),
    );
  });
});
