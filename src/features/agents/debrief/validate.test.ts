// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    notification: { findMany: vi.fn() },
    vulnerability: { findMany: vi.fn() },
    asset: { findMany: vi.fn() },
    remediation: { findMany: vi.fn() },
    issue: { findMany: vi.fn() },
    workOrderTicket: { findMany: vi.fn() },
  },
}));

vi.mock("@/lib/db", () => ({ default: mockPrisma }));

import { debriefBulletsSchema } from "@/features/debrief/types";
import { validateBullets } from "./validate";

/** Make every id the caller lists resolve as existing. */
function idsExist(model: keyof typeof mockPrisma) {
  mockPrisma[model].findMany.mockImplementation(
    async ({ where }: { where: { id: { in: string[] } } }) =>
      where.id.in.map((id) => ({ id })),
  );
}

/** Make every id resolve as missing. */
function idsMissing(model: keyof typeof mockPrisma) {
  mockPrisma[model].findMany.mockResolvedValue([]);
}

const vulnLink = (id = "vuln-1") => ({
  label: "the Nephrotek flaw",
  entityType: "vulnerability" as const,
  entityId: id,
});
const assetLink = (id = "asset-1") => ({
  label: "eleven MX800 monitors",
  entityType: "asset" as const,
  entityId: id,
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("validateBullets — the happy path", () => {
  it("keeps a well-formed bullet untouched", async () => {
    idsExist("vulnerability");

    const { bullets, droppedLinks } = await validateBullets([
      { text: "Two machines are exposed by {{0}}.", links: [vulnLink()] },
    ]);

    expect(droppedLinks).toBe(0);
    expect(bullets[0].text).toBe("Two machines are exposed by {{0}}.");
    expect(bullets[0].links).toHaveLength(1);
    expect(debriefBulletsSchema.safeParse(bullets).success).toBe(true);
  });
});

describe("validateBullets — hallucinated ids", () => {
  it("drops a link whose id does not exist and inlines its label", async () => {
    idsMissing("vulnerability");

    const { bullets, droppedLinks } = await validateBullets([
      { text: "Two machines are exposed by {{0}}.", links: [vulnLink()] },
    ]);

    expect(droppedLinks).toBe(1);
    expect(bullets[0].links).toHaveLength(0);
    // The fact survives even though the link did not.
    expect(bullets[0].text).toBe(
      "Two machines are exposed by the Nephrotek flaw.",
    );
  });

  it("renumbers the survivors when a middle link is dropped", async () => {
    // vuln ids exist, asset ids do not: {{1}} goes, {{2}} must become {{1}}.
    idsExist("vulnerability");
    idsMissing("asset");

    const { bullets } = await validateBullets([
      {
        text: "First {{0}}, second {{1}}, third {{2}}.",
        links: [vulnLink("v1"), assetLink("gone"), vulnLink("v2")],
      },
    ]);

    expect(bullets[0].text).toBe(
      "First {{0}}, second eleven MX800 monitors, third {{1}}.",
    );
    expect(bullets[0].links.map((l) => l.entityId)).toEqual(["v1", "v2"]);
    expect(debriefBulletsSchema.safeParse(bullets).success).toBe(true);
  });

  it("survives a model that invented every id", async () => {
    idsMissing("vulnerability");
    idsMissing("asset");

    const { bullets } = await validateBullets([
      { text: "A {{0}} problem.", links: [vulnLink()] },
      { text: "An {{0}} problem.", links: [assetLink()] },
    ]);

    // Two bullets of prose, no links, still valid.
    expect(bullets).toHaveLength(2);
    expect(bullets.every((b) => b.links.length === 0)).toBe(true);
    expect(debriefBulletsSchema.safeParse(bullets).success).toBe(true);
  });
});

describe("validateBullets — malformed drafts", () => {
  it("removes a placeholder that points past the end of the links array", async () => {
    idsExist("vulnerability");

    const { bullets } = await validateBullets([
      { text: "Real {{0}}, phantom {{7}}.", links: [vulnLink()] },
    ]);

    expect(bullets[0].text).toBe("Real {{0}}, phantom .");
    expect(debriefBulletsSchema.safeParse(bullets).success).toBe(true);
  });

  it("drops a link the text never references", async () => {
    // An unreferenced link fails the strict schema, so it cannot be kept.
    idsExist("vulnerability");

    const { bullets } = await validateBullets([
      { text: "No marker here at all.", links: [vulnLink()] },
    ]);

    expect(bullets[0].links).toHaveLength(0);
    expect(debriefBulletsSchema.safeParse(bullets).success).toBe(true);
  });

  it("clamps to five bullets", async () => {
    idsExist("vulnerability");

    const draft = Array.from({ length: 8 }, (_, i) => ({
      text: `Item ${i}.`,
      links: [],
    }));

    const { bullets } = await validateBullets(draft);

    expect(bullets).toHaveLength(5);
  });

  it("returns nothing for an empty draft without touching the database", async () => {
    const { bullets } = await validateBullets([]);

    expect(bullets).toEqual([]);
    expect(mockPrisma.vulnerability.findMany).not.toHaveBeenCalled();
  });
});

describe("validateBullets — database access", () => {
  it("looks up each entity type once, batched", async () => {
    idsExist("vulnerability");

    await validateBullets([
      { text: "{{0}} and {{1}}", links: [vulnLink("a"), vulnLink("b")] },
      { text: "{{0}}", links: [vulnLink("c")] },
    ]);

    expect(mockPrisma.vulnerability.findMany).toHaveBeenCalledTimes(1);
    const [{ where }] = mockPrisma.vulnerability.findMany.mock.calls[0];
    expect([...where.id.in].sort()).toEqual(["a", "b", "c"]);
  });

  it("does not query an entity type the draft never mentions", async () => {
    idsExist("vulnerability");

    await validateBullets([{ text: "{{0}}", links: [vulnLink()] }]);

    expect(mockPrisma.asset.findMany).not.toHaveBeenCalled();
    expect(mockPrisma.workOrderTicket.findMany).not.toHaveBeenCalled();
  });
});

describe("validateBullets — text and links stay in step", () => {
  // Regression: the first version renumbered against every surviving link, then
  // filtered the array by what the text referenced. Two different notions of
  // "kept" meant a valid-but-unreferenced link shifted the array under the
  // text, leaving a marker pointing past the end. The strict schema then
  // rejected the bullet and parseBullets blanked the whole debrief.
  it("handles a valid link the text skips over", async () => {
    idsExist("vulnerability");

    const { bullets } = await validateBullets([
      {
        text: "See {{0}} and {{2}}.",
        links: [vulnLink("A"), vulnLink("B"), vulnLink("C")],
      },
    ]);

    // B is dropped because nothing points at it; C renumbers 2 -> 1.
    expect(bullets[0].text).toBe("See {{0}} and {{1}}.");
    expect(bullets[0].links.map((l) => l.entityId)).toEqual(["A", "C"]);
    expect(debriefBulletsSchema.safeParse(bullets).success).toBe(true);
  });

  it("still counts a dropped id the text never referenced", async () => {
    // The warning counts bad ids, not unreferenced links, so an invented id
    // must register even when no marker pointed at it.
    idsMissing("vulnerability");

    const { droppedLinks } = await validateBullets([
      { text: "No markers here.", links: [vulnLink("ghost")] },
    ]);

    expect(droppedLinks).toBe(1);
  });

  it("never emits a marker index beyond the links array", async () => {
    // Property-style sweep over the shapes a model realistically produces.
    idsExist("vulnerability");
    const shapes = [
      "{{0}}",
      "{{1}} only",
      "{{0}} {{1}} {{2}}",
      "{{2}} first, {{0}} second",
      "none at all",
      "{{0}} and {{0}} twice",
    ];

    for (const text of shapes) {
      const { bullets } = await validateBullets([
        { text, links: [vulnLink("A"), vulnLink("B"), vulnLink("C")] },
      ]);
      if (bullets.length === 0) continue;
      const used = [...bullets[0].text.matchAll(/\{\{(\d+)\}\}/g)].map((m) =>
        Number(m[1]),
      );
      for (const index of used) {
        expect(index).toBeLessThan(bullets[0].links.length);
      }
      expect(debriefBulletsSchema.safeParse(bullets).success).toBe(true);
    }
  });
});
