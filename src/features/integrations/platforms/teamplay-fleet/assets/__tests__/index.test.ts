// @vitest-environment node
import { describe, expect, it } from "vitest";
import { computeWeakSerials, listChanged, toCanonical } from "../equipments";
import { assets } from "../index";

// Representative records from a real Fleet /rest/v1/equipments response.
const SAMPLE = [
  {
    equipmentKey: "US_1006103273",
    serialNumber: "63014",
    productName: "syngo WebSpace",
    modalityTranslation: "Computed Tomography (CT)",
    softwareVersion: "VA11A",
    customerName: "SIEMENS DEMO/EVALUATION",
    street: "51 VALLEY STREAM PKWY",
    city: "MALVERN",
    state: "PA",
    zip: "19355",
    department: "",
    isActive: true,
  },
  {
    equipmentKey: "US_1064669350",
    serialNumber: "142746",
    productName: "MAGNETOM Aera VA60A-SP01",
    modalityTranslation: "Magnetic Resonance",
    softwareVersion: "",
    customerName: "SIEMENS DEMO/EVALUATION",
    street: "51 VALLEY STREAM PKWY",
    city: "MALVERN",
    state: "PA",
    zip: "19355",
    isActive: true,
  },
];

const canonical = (raw: (typeof SAMPLE)[number]) => toCanonical(raw);

describe("toCanonical", () => {
  it("maps a real equipment record onto the asset draft", () => {
    expect(canonical(SAMPLE[0])).toEqual({
      vendorId: "US_1006103273",
      serialNumber: "63014",
      role: "Computed Tomography (CT)",
      location: {
        facility: "SIEMENS DEMO/EVALUATION",
        building: "51 VALLEY STREAM PKWY, MALVERN, PA 19355",
      },
      productName: "syngo WebSpace",
      softwareVersion: "VA11A",
    });
  });

  it("turns empty strings into nulls", () => {
    const item = canonical(SAMPLE[1]);
    expect(item.softwareVersion).toBeNull();
  });
});

describe("listChanged", () => {
  const session = (payload: unknown) => ({
    request: async () =>
      ({ ok: true, json: async () => payload }) as unknown as Response,
  });

  it("yields the whole inventory as one page with no cursor", async () => {
    const pages = [];
    for await (const page of listChanged(session(SAMPLE), null))
      pages.push(page);
    expect(pages).toHaveLength(1);
    expect(pages[0].items).toHaveLength(2);
    expect(pages[0].cursor).toBeNull();
  });

  it("drops inactive equipment", async () => {
    const retired = [{ ...SAMPLE[0], isActive: false }, SAMPLE[1]];
    for await (const page of listChanged(session(retired), null))
      expect(page.items.map((r) => r.equipmentKey)).toEqual(["US_1064669350"]);
  });
});

describe("serial numbers", () => {
  it("trims surrounding whitespace", () => {
    expect(
      canonical({ ...SAMPLE[0], serialNumber: "  63014 " }).serialNumber,
    ).toBe("63014");
  });

  it.each(["N/A", "n/a", "UNKNOWN", "none", "-", "0", "   "])(
    "treats %s as no serial at all",
    (placeholder) => {
      expect(
        canonical({ ...SAMPLE[0], serialNumber: placeholder }).serialNumber,
      ).toBeNull();
    },
  );
});

describe("computeWeakSerials", () => {
  it("flags serials shared by two Fleet records", () => {
    // Syngo Carbon installs share one serial across components (real tenant data).
    const items = [
      { ...canonical(SAMPLE[0]), serialNumber: "100153" },
      { ...canonical(SAMPLE[1]), serialNumber: "100153" },
      canonical(SAMPLE[0]),
    ];
    expect(computeWeakSerials(items)).toEqual(new Set(["100153"]));
  });
});

describe("apiUrlFor", () => {
  it("returns the collection endpoint (Fleet has no per-record URL)", () => {
    expect(assets.apiUrlFor?.("US_1006103273", {})).toBe(
      "https://fleet.siemens-healthineers.com/rest/v1/equipments",
    );
  });
});

describe("webUrlFor", () => {
  it("points at the equipment's info page on Fleet", () => {
    expect(assets.webUrlFor?.("US_3000438672", {})).toBe(
      "https://fleet.siemens-healthineers.com/equipment/US_3000438672/info",
    );
  });

  it("escapes an equipment key that would otherwise alter the path", () => {
    expect(assets.webUrlFor?.("US_1/../admin", {})).toBe(
      "https://fleet.siemens-healthineers.com/equipment/US_1%2F..%2Fadmin/info",
    );
  });
});

describe("the resource module", () => {
  it("wires up the sync core dispatches to", () => {
    expect(assets.sync).toBeTypeOf("function");
  });

  it("asks for a daily sync", () => {
    expect(assets.defaultSyncEvery).toBe(86400);
  });
});
