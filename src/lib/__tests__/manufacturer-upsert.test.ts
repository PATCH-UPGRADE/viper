// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ default: {} }));

import type { ManufacturerEntry } from "../manufacturer-catalog";
import {
  planManufacturerUpserts,
  type StoredManufacturer,
} from "../manufacturer-upsert";

const siemensHealthineers: ManufacturerEntry = {
  canonicalName: "siemens healthineers",
  canonicalDisplayName: "Siemens Healthineers",
  hasCpe: false,
  nameMappings: ["siemens", "siemens healthcare"],
};

describe("planManufacturerUpserts", () => {
  it("creates a manufacturer the database does not have", () => {
    const plan = planManufacturerUpserts([siemensHealthineers], []);

    expect(plan.writes).toEqual([
      { kind: "create", manufacturer: siemensHealthineers },
    ]);
    expect(plan.conflicts).toEqual([]);
  });

  it("adds only the aliases the database is missing", () => {
    const stored: StoredManufacturer = {
      id: "m1",
      canonicalName: "siemens healthineers",
      nameMappings: ["siemens ag"],
    };

    const plan = planManufacturerUpserts([siemensHealthineers], [stored]);

    expect(plan.writes).toEqual([
      {
        kind: "addAliases",
        id: "m1",
        canonicalName: "siemens healthineers",
        aliases: ["siemens", "siemens healthcare"],
      },
    ]);
  });

  it("leaves an up-to-date manufacturer unchanged", () => {
    const stored: StoredManufacturer = {
      id: "m1",
      canonicalName: "siemens healthineers",
      nameMappings: ["siemens healthcare", "siemens"],
    };

    const plan = planManufacturerUpserts([siemensHealthineers], [stored]);

    expect(plan.writes).toEqual([]);
    expect(plan.unchanged).toEqual(["siemens healthineers"]);
  });

  it("skips an alias that is already another manufacturer's canonicalName", () => {
    const storedHealthineers: StoredManufacturer = {
      id: "m1",
      canonicalName: "siemens healthineers",
      nameMappings: [],
    };
    const storedSiemensFromCpe: StoredManufacturer = {
      id: "m4",
      canonicalName: "siemens",
      nameMappings: [],
    };

    const plan = planManufacturerUpserts(
      [siemensHealthineers],
      [storedHealthineers, storedSiemensFromCpe],
    );

    expect(plan.writes).toEqual([
      {
        kind: "addAliases",
        id: "m1",
        canonicalName: "siemens healthineers",
        aliases: ["siemens healthcare"],
      },
    ]);
    expect(plan.conflicts).toEqual([
      {
        manufacturer: "siemens healthineers",
        name: "siemens",
        claimedBy: "siemens",
      },
    ]);
  });

  it("skips an alias that another manufacturer already lists as its alias", () => {
    const storedOther: StoredManufacturer = {
      id: "m9",
      canonicalName: "siemens ag",
      nameMappings: ["siemens"],
    };

    const plan = planManufacturerUpserts([siemensHealthineers], [storedOther]);

    expect(plan.writes).toEqual([
      {
        kind: "create",
        manufacturer: {
          ...siemensHealthineers,
          nameMappings: ["siemens healthcare"],
        },
      },
    ]);
    expect(plan.conflicts).toEqual([
      {
        manufacturer: "siemens healthineers",
        name: "siemens",
        claimedBy: "siemens ag",
      },
    ]);
  });

  it("does not create a manufacturer whose name is already another row's alias", () => {
    const storedOther: StoredManufacturer = {
      id: "m9",
      canonicalName: "siemens ag",
      nameMappings: ["siemens healthineers"],
    };

    const plan = planManufacturerUpserts([siemensHealthineers], [storedOther]);

    expect(plan.writes).toEqual([]);
    expect(plan.conflicts).toEqual([
      {
        manufacturer: "siemens healthineers",
        name: "siemens healthineers",
        claimedBy: "siemens ag",
      },
    ]);
  });

  it("does not let a later entry claim a name an earlier entry in the same run claimed", () => {
    const siemensAg: ManufacturerEntry = {
      canonicalName: "siemens ag",
      canonicalDisplayName: "Siemens AG",
      hasCpe: false,
      nameMappings: ["siemens"],
    };

    const plan = planManufacturerUpserts([siemensHealthineers, siemensAg], []);

    expect(plan.writes).toEqual([
      { kind: "create", manufacturer: siemensHealthineers },
      {
        kind: "create",
        manufacturer: { ...siemensAg, nameMappings: [] },
      },
    ]);
    expect(plan.conflicts).toEqual([
      {
        manufacturer: "siemens ag",
        name: "siemens",
        claimedBy: "siemens healthineers",
      },
    ]);
  });

  it("does not let a new entry claim an alias an existing manufacturer gained earlier in the same run", () => {
    const stored: StoredManufacturer = {
      id: "m1",
      canonicalName: "siemens healthineers",
      nameMappings: [],
    };
    const siemensAg: ManufacturerEntry = {
      canonicalName: "siemens ag",
      canonicalDisplayName: "Siemens AG",
      hasCpe: false,
      nameMappings: ["siemens"],
    };

    const plan = planManufacturerUpserts(
      [siemensHealthineers, siemensAg],
      [stored],
    );

    expect(plan.writes).toEqual([
      {
        kind: "addAliases",
        id: "m1",
        canonicalName: "siemens healthineers",
        aliases: ["siemens", "siemens healthcare"],
      },
      {
        kind: "create",
        manufacturer: { ...siemensAg, nameMappings: [] },
      },
    ]);
    expect(plan.conflicts).toEqual([
      {
        manufacturer: "siemens ag",
        name: "siemens",
        claimedBy: "siemens healthineers",
      },
    ]);
  });
});
