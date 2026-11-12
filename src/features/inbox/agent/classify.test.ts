// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    sourceRecord: { findUniqueOrThrow: vi.fn() },
    notification: { findMany: vi.fn() },
  },
}));
vi.mock("@/lib/db", () => ({ default: mockPrisma }));

const { buildTextPrompt, classifyContext } = await import("./classify");

const matching = (
  id: string,
  manufacturer: string,
  product: string,
  version: string | null,
) => ({
  deviceGroupMatchingId: id,
  confidence: "Matched",
  deviceGroupMatching: {
    id,
    manufacturerId: "m-1",
    productId: "p-1",
    versionId: version ? "v-1" : null,
    versionRange: null,
    versionStatus: null,
    manufacturer: { canonicalDisplayName: manufacturer },
    product: { canonicalDisplayName: product },
    version: version ? { canonicalDisplayName: version } : null,
  },
});

const linkedRecord = {
  vulnerabilities: [
    {
      vulnerabilityId: "vuln-1",
      confidence: "Matched",
      vulnerability: { displayId: "CVE-2026-0001" },
    },
  ],
  deviceGroupMatchings: [matching("dgm-1", "Acme", "Radiator", "2.1")],
};

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.notification.findMany.mockResolvedValue([]);
});

describe("classifyContext", () => {
  it("offers only the notifications that share a linked entity", async () => {
    mockPrisma.sourceRecord.findUniqueOrThrow.mockResolvedValue(linkedRecord);

    await classifyContext("src-1");

    expect(mockPrisma.notification.findMany).toHaveBeenCalledWith({
      where: {
        sourceLinks: {
          some: {
            sourceRecord: {
              OR: [
                {
                  vulnerabilities: {
                    some: { vulnerabilityId: { in: ["vuln-1"] } },
                  },
                },
                {
                  deviceGroupMatchings: {
                    some: { deviceGroupMatchingId: { in: ["dgm-1"] } },
                  },
                },
              ],
            },
          },
        },
      },
      select: { id: true, type: true, title: true, summary: true },
      orderBy: { createdAt: "desc" },
    });
  });

  it("offers every notification when the record links nothing", async () => {
    mockPrisma.sourceRecord.findUniqueOrThrow.mockResolvedValue({
      vulnerabilities: [],
      deviceGroupMatchings: [],
    });

    await classifyContext("src-1");

    expect(mockPrisma.notification.findMany.mock.calls[0][0].where).toEqual({});
  });

  it("leaves a rejected link out of the record's mappings", async () => {
    mockPrisma.sourceRecord.findUniqueOrThrow.mockResolvedValue(linkedRecord);

    await classifyContext("src-1");

    const { select } =
      mockPrisma.sourceRecord.findUniqueOrThrow.mock.calls[0][0];
    const notRejected = {
      OR: [{ confidence: null }, { confidence: { not: "Rejected" } }],
    };
    expect(select.vulnerabilities.where).toEqual(notRejected);
    expect(select.deviceGroupMatchings.where).toEqual(notRejected);
  });

  it("labels each link for the prompt", async () => {
    mockPrisma.sourceRecord.findUniqueOrThrow.mockResolvedValue(linkedRecord);

    const { linked } = await classifyContext("src-1");

    expect(linked).toEqual({
      vulnerabilities: [{ label: "CVE-2026-0001", confidence: "Matched" }],
      deviceGroups: [{ label: "Acme Radiator 2.1", confidence: "Matched" }],
    });
  });
});

describe("buildTextPrompt", () => {
  const email = {
    from: "security@acme.example",
    subject: "Radiator patch",
    markdown: "# Patch the radiator",
  };

  it("puts the links and the candidates after the email", () => {
    const prompt = buildTextPrompt(email, {
      linked: {
        vulnerabilities: [{ label: "CVE-2026-0001", confidence: "Matched" }],
        deviceGroups: [{ label: "Acme Radiator 2.1", confidence: null }],
      },
      existingNotifications: [
        {
          id: "n-1",
          type: "Advisory",
          title: "Radiator advisory",
          summary: null,
        },
      ],
    });

    expect(prompt).toBe(`From: security@acme.example
Subject: Radiator patch

--- EMAIL BODY ---
# Patch the radiator

--- LINKED ENTITIES ---
Vulnerabilities:
- CVE-2026-0001 (Matched)
Device groups:
- Acme Radiator 2.1

--- EXISTING NOTIFICATIONS ---
- id: n-1 | type: Advisory | title: Radiator advisory | summary: (none)`);
  });

  it("says so when nothing is linked and nothing exists", () => {
    const prompt = buildTextPrompt(email, {
      linked: { vulnerabilities: [], deviceGroups: [] },
      existingNotifications: [],
    });

    expect(prompt).toContain(
      "Vulnerabilities:\n(none)\nDevice groups:\n(none)",
    );
    expect(prompt).toContain("--- EXISTING NOTIFICATIONS ---\n(none)");
  });
});
