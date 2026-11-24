// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@/generated/prisma";
import {
  applyObservation,
  createWithObservation,
  deleteWithObservation,
} from "../write";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ default: {} }));

type Row = Record<string, unknown>;

const NO_DEVICE = {
  manufacturerId: null,
  productId: null,
  versionId: null,
  versionStatus: "UNKNOWN",
} as const;

/** An in-memory transaction, with the column defaults of `asset`. */
function makeTx() {
  const assets = new Map<string, Row>();
  const observations: Row[] = [];
  const fieldChanges: Row[] = [];
  const names: Record<string, string> = {
    m1: "Siemens",
    p1: "MAGNETOM",
    p2: "SOMATOM",
    v1: "VA10",
  };
  const label = vi.fn(async ({ where }: { where: { id: string } }) =>
    names[where.id] ? { canonicalDisplayName: names[where.id] } : null,
  );
  const columns = (data: Row): Row =>
    Object.fromEntries(
      Object.entries(data).map(([key, value]) => [
        key,
        value === Prisma.DbNull ? null : value,
      ]),
    );

  const queryRaw = vi.fn(async () => []);
  const findAsset = vi.fn(
    async ({ where }: { where: { id: string } }) =>
      assets.get(where.id) ?? null,
  );
  const updateAsset = vi.fn(
    async ({ where, data }: { where: { id: string }; data: Row }) => {
      Object.assign(assets.get(where.id)!, columns(data));
    },
  );

  const tx = {
    $queryRaw: queryRaw,
    manufacturer: { findUnique: label },
    product: { findUnique: label },
    version: { findUnique: label },
    asset: {
      findUnique: findAsset,
      update: updateAsset,
      create: async ({ data }: { data: Row }) => {
        const row = { id: "asset_1", ip: null, ...NO_DEVICE, ...columns(data) };
        assets.set(row.id, row);
        return row;
      },
      delete: async ({ where }: { where: { id: string } }) => {
        const row = assets.get(where.id);
        assets.delete(where.id);
        return row;
      },
    },
    observation: {
      create: async ({ data }: { data: Row }) => {
        const seq = observations.length + 1;
        const row = { id: `observation_${seq}`, seq, ...data };
        observations.push(row);
        return row;
      },
      findFirst: async ({
        where,
      }: {
        where: Row & { kind: { in: string[] } };
      }) =>
        observations.findLast(
          (o) =>
            o.entityType === where.entityType &&
            o.entityId === where.entityId &&
            o.source === where.source &&
            o.integrationId === where.integrationId &&
            where.kind.in.includes(o.kind as string),
        ) ?? null,
    },
    fieldChange: {
      createMany: async ({ data }: { data: Row[] }) => {
        fieldChanges.push(...data.map(columns));
      },
    },
  };
  return {
    tx: tx as unknown as Parameters<typeof applyObservation>[0],
    assets,
    observations,
    fieldChanges,
    names,
    label,
    queryRaw,
    findAsset,
    updateAsset,
  };
}

let db: ReturnType<typeof makeTx>;

const fleet = {
  source: "INTEGRATION",
  integrationId: "fleet",
  integrationName: "teamplay Fleet",
  observedAt: new Date("2026-11-24T10:00:00Z"),
} as const;
const partner = {
  ...fleet,
  integrationId: "partner",
  integrationName: "Partner",
} as const;
const user = { source: "MANUAL", actorUserId: "user_1" } as const;

type ApplyParams = Parameters<typeof applyObservation<"ASSET">>[1];
type Fields = ApplyParams["fields"];
type Apply = ApplyParams["apply"];

const create = (fields: Fields, origin: ApplyParams["origin"] = fleet) =>
  createWithObservation(db.tx, { entityType: "ASSET", fields, origin }, (raw) =>
    raw.asset.create({ data: { ...fields, userId: "u" } as never }),
  );
const snapshot = (
  fields: Fields,
  origin: typeof fleet | typeof partner = fleet,
  apply?: Apply,
) =>
  applyObservation(db.tx, {
    entityType: "ASSET",
    entityId: "asset_1",
    kind: "SNAPSHOT",
    origin,
    fields,
    apply,
  });
const patch = (
  fields: Fields,
  origin: ApplyParams["origin"] = user,
  apply?: Apply,
) =>
  applyObservation(db.tx, {
    entityType: "ASSET",
    entityId: "asset_1",
    kind: "PATCH",
    origin,
    fields,
    apply,
  });

const asset = () => db.assets.get("asset_1")!;
const kinds = () => db.observations.map((o) => o.kind);
const last = () => db.observations.at(-1)!;
/** The FieldChanges of the newest observation, as `[field, old, new]`. */
const lastChanges = () =>
  db.fieldChanges
    .filter((c) => c.observationId === last().id)
    .map((c) => [c.field, c.oldValue, c.newValue]);

beforeEach(() => {
  db = makeTx();
});

describe("createWithObservation", () => {
  it("records what the source stated, with one FieldChange per value", async () => {
    const row = await create({
      hostname: "ct-1",
      serialNumber: null,
      role: "Workstation",
    });

    expect(row.id).toBe("asset_1");
    expect(db.observations).toHaveLength(1);
    expect(last()).toMatchObject({
      kind: "CREATE",
      entityType: "ASSET",
      entityId: "asset_1",
      fields: { hostname: "ct-1", serialNumber: null },
    });
    expect(lastChanges()).toEqual([["hostname", null, "ct-1"]]);
  });

  it("stores a foreign key with its label, and looks each one up once", async () => {
    await create({
      manufacturerId: "m1",
      productId: "p1",
      versionId: null,
      versionStatus: "UNKNOWN",
    });
    expect(last().fields).toEqual({
      manufacturerId: { id: "m1", label: "Siemens" },
      productId: { id: "p1", label: "MAGNETOM" },
      versionId: null,
      versionStatus: "UNKNOWN",
    });
    expect(lastChanges()).toEqual([
      ["manufacturerId", null, { id: "m1", label: "Siemens" }],
      ["productId", null, { id: "p1", label: "MAGNETOM" }],
      ["versionStatus", null, "UNKNOWN"],
    ]);
    expect(db.label).toHaveBeenCalledTimes(2);
  });

  it('counts "" as empty', async () => {
    await create({ hostname: "" });
    expect(last().fields).toEqual({ hostname: null });
    expect(lastChanges()).toEqual([]);
  });
});

describe("a SNAPSHOT", () => {
  beforeEach(async () => {
    await create({ hostname: "ct-1", location: { facility: "ICU" } });
  });

  it("writes nothing when the source repeats itself", async () => {
    db.updateAsset.mockClear();
    await snapshot({ hostname: "ct-1", location: { facility: "ICU" } });
    expect(kinds()).toEqual(["CREATE"]);
    expect(db.updateAsset).not.toHaveBeenCalled();
  });

  it("still saves the ignored fields of a repeat", async () => {
    await snapshot({
      hostname: "ct-1",
      location: { facility: "ICU" },
      role: "Workstation",
      utilization: null,
    });
    expect(kinds()).toEqual(["CREATE"]);
    expect(db.updateAsset).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        data: { role: "Workstation", utilization: Prisma.DbNull },
      }),
    );
  });

  it("applies what the source changed, with its ignored fields", async () => {
    await snapshot({
      hostname: "ct-2",
      location: { facility: "ICU" },
      role: "Workstation",
    });
    expect(asset()).toMatchObject({ hostname: "ct-2", role: "Workstation" });
    expect(last()).toMatchObject({
      kind: "SNAPSHOT",
      fields: { hostname: "ct-2", location: { facility: "ICU" } },
    });
    expect(lastChanges()).toEqual([["hostname", "ct-1", "ct-2"]]);
  });

  it("doesn't overwrite a user's edit with a value the source keeps sending", async () => {
    await patch({ location: { facility: "ER" } });
    await snapshot({ hostname: "ct-2", location: { facility: "ICU" } });
    expect(asset()).toMatchObject({
      hostname: "ct-2",
      location: { facility: "ER" },
    });
  });

  it("writes no FieldChange when the source catches up with the golden record", async () => {
    await patch({ hostname: "ct-2" });
    await snapshot({ hostname: "ct-2", location: { facility: "ICU" } });
    expect(kinds()).toEqual(["CREATE", "PATCH", "SNAPSHOT"]);
    expect(lastChanges()).toEqual([]);
  });

  it("doesn't flip a field that two sources disagree on", async () => {
    await snapshot({ hostname: "partner-1" }, partner);
    expect(asset().hostname).toBe("partner-1");
    for (let sync = 0; sync < 2; sync++) {
      await snapshot({ hostname: "ct-1", location: { facility: "ICU" } });
      await snapshot({ hostname: "partner-1" }, partner);
    }
    expect(asset().hostname).toBe("partner-1");
    expect(kinds()).toEqual(["CREATE", "SNAPSHOT"]);
  });

  it("keeps a field that the source stops stating, and applies it when it returns", async () => {
    await snapshot({ hostname: "ct-1" });
    expect(last()).toMatchObject({
      kind: "SNAPSHOT",
      fields: { hostname: "ct-1" },
    });
    expect(asset().location).toEqual({ facility: "ICU" });
    expect(lastChanges()).toEqual([]);

    await patch({ location: { facility: "ER" } });
    await snapshot({ hostname: "ct-1", location: { facility: "ICU" } });
    expect(asset().location).toEqual({ facility: "ICU" });
  });

  it("treats undefined as a missing key", async () => {
    await snapshot({ hostname: "ct-1", location: undefined });
    expect(last().fields).toEqual({ hostname: "ct-1" });
  });

  it("clears a field on an explicit null, with DbNull for JSON", async () => {
    await snapshot({ hostname: "ct-1", location: null });
    expect(asset().location).toBeNull();
    expect(db.updateAsset).toHaveBeenLastCalledWith(
      expect.objectContaining({ data: { location: Prisma.DbNull } }),
    );
    expect(lastChanges()).toEqual([["location", { facility: "ICU" }, null]]);
  });

  it("compares JSON without key order or undefined keys", async () => {
    await snapshot({
      hostname: "ct-1",
      location: { facility: "A", room: "1" },
    });
    await snapshot({
      hostname: "ct-1",
      location: { room: "1", facility: "A", floor: undefined },
    });
    expect(kinds()).toEqual(["CREATE", "SNAPSHOT"]);
  });
});

describe("a PATCH", () => {
  beforeEach(async () => {
    await create({ hostname: "ct-1", location: { facility: "ICU" } });
  });

  it("applies again after another source changed the field in between", async () => {
    await patch({ location: { facility: "ER" } });
    await snapshot({ hostname: "ct-1", location: { facility: "Lab" } });
    await patch({ location: { facility: "ER" } });
    expect(asset().location).toEqual({ facility: "ER" });
  });

  it("writes nothing when it changes nothing", async () => {
    await patch({ hostname: "ct-1" });
    expect(kinds()).toEqual(["CREATE"]);
  });

  it("holds only the fields it changed", async () => {
    await patch({ hostname: "ct-1", serialNumber: "S1" });
    expect(last()).toMatchObject({
      kind: "PATCH",
      fields: { serialNumber: "S1" },
    });
  });

  it("records a changed field that it may not apply", async () => {
    await patch({ hostname: "other", serialNumber: "S1" }, user, [
      "serialNumber",
    ]);
    expect(asset()).toMatchObject({ hostname: "ct-1", serialNumber: "S1" });
    expect(last().fields).toEqual({ hostname: "other", serialNumber: "S1" });
    expect(lastChanges()).toEqual([["serialNumber", null, "S1"]]);
  });

  it("records the stated value where another one is applied", async () => {
    await create({ location: { building: "B" } });
    await applyObservation(db.tx, {
      entityType: "ASSET",
      entityId: "asset_1",
      kind: "PATCH",
      origin: user,
      fields: { location: { room: "1" } },
      applyAs: { location: { building: "B", room: "1" } },
    });

    expect(last().fields).toEqual({ location: { room: "1" } });
    expect(asset().location).toEqual({ building: "B", room: "1" });
    expect(lastChanges()).toEqual([
      ["location", { building: "B" }, { building: "B", room: "1" }],
    ]);
  });

  it("isn't what a later SNAPSHOT is compared to", async () => {
    await patch({ hostname: "ct-9" }, fleet);
    await snapshot({ hostname: "ct-1", location: { facility: "ICU" } });
    expect(asset().hostname).toBe("ct-9");
  });
});

describe("the device field group", () => {
  const device = (productId: string, versionId: string | null = null) => ({
    manufacturerId: "m1",
    productId,
    versionId,
    versionStatus: versionId ? ("KNOWN" as const) : ("UNKNOWN" as const),
  });

  beforeEach(async () => {
    await create(device("p1"));
    await patch(device("p1", "v1"));
  });

  it("gives each field its own FieldChange, only if it changed", () => {
    expect(last().fields).toEqual({
      versionId: { id: "v1", label: "VA10" },
      versionStatus: "KNOWN",
    });
    expect(lastChanges()).toEqual([
      ["versionId", null, { id: "v1", label: "VA10" }],
      ["versionStatus", "UNKNOWN", "KNOWN"],
    ]);
  });

  it("clears a version that a user set when a source changes the product", async () => {
    await snapshot(device("p2"));
    expect(asset()).toMatchObject(device("p2"));
    expect(lastChanges()).toEqual([
      [
        "productId",
        { id: "p1", label: "MAGNETOM" },
        { id: "p2", label: "SOMATOM" },
      ],
      ["versionId", { id: "v1", label: "VA10" }, null],
      ["versionStatus", "KNOWN", "UNKNOWN"],
    ]);
  });

  it("stays as it is when the source changes another field", async () => {
    await snapshot({ ...device("p1"), serialNumber: "S1" });
    expect(asset()).toMatchObject({
      ...device("p1", "v1"),
      serialNumber: "S1",
    });
  });

  it("is applied as a whole or not at all", async () => {
    await snapshot({ ...device("p2"), serialNumber: "S1" }, fleet, [
      "serialNumber",
    ]);
    expect(asset()).toMatchObject({
      ...device("p1", "v1"),
      serialNumber: "S1",
    });
    expect(last().fields).toMatchObject({
      productId: { id: "p2", label: "SOMATOM" },
    });

    // Fleet says the same, so it has nothing left to apply.
    await snapshot({ ...device("p2"), serialNumber: "S1" });
    expect(asset().productId).toBe("p1");

    await snapshot({ ...NO_DEVICE, serialNumber: "S1" }, fleet, ["device"]);
    expect(asset()).toMatchObject(NO_DEVICE);
  });

  it("isn't changed by renaming the product", async () => {
    db.names.p1 = "MAGNETOM Renamed";
    await snapshot(device("p1"));
    expect(kinds()).toEqual(["CREATE", "PATCH"]);
  });

  it("falls back to the id when the referenced row is gone", async () => {
    await snapshot(device("gone"), fleet, []);
    expect(last().fields).toMatchObject({
      productId: { id: "gone", label: "gone" },
    });
  });
});

describe("deleteWithObservation", () => {
  it("writes a TOMBSTONE, and keeps the history", async () => {
    await create({ hostname: "ct-1" });
    const removed = await deleteWithObservation(
      db.tx,
      { entityType: "ASSET", entityId: "asset_1", origin: user },
      (raw) => raw.asset.delete({ where: { id: "asset_1" } }),
    );
    expect(removed).toMatchObject({ hostname: "ct-1" });
    expect(db.assets.size).toBe(0);
    expect(kinds()).toEqual(["CREATE", "TOMBSTONE"]);
    expect(last()).toMatchObject({ fields: {}, actorUserId: "user_1" });
    expect(lastChanges()).toEqual([]);
    expect(db.fieldChanges).toHaveLength(1);
  });

  it("doesn't call the callback for an entity that doesn't exist", async () => {
    const remove = vi.fn();
    await expect(
      deleteWithObservation(
        db.tx,
        { entityType: "ASSET", entityId: "asset_1", origin: user },
        remove,
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(remove).not.toHaveBeenCalled();
    expect(db.observations).toEqual([]);
  });
});

describe("every write", () => {
  it("records an integration, and the time of its sync", async () => {
    await create({ hostname: "ct-1" }, { ...fleet, actorUserId: "uploader" });
    expect(last()).toMatchObject({ ...fleet, actorUserId: "uploader" });
  });

  it("records a person without an integration", async () => {
    await create({ hostname: "ct-1" }, user);
    expect(last()).toMatchObject(user);
    expect(last()).not.toHaveProperty("integrationId");
    expect(last()).not.toHaveProperty("integrationName");
    // The database sets it to now.
    expect(last().observedAt).toBeUndefined();
  });

  it("stores the source record, and the reason on each FieldChange", async () => {
    await create({ hostname: "ct-1" });
    await applyObservation(db.tx, {
      entityType: "ASSET",
      entityId: "asset_1",
      kind: "PATCH",
      origin: user,
      fields: { hostname: "ct-2" },
      sourceRecordId: "record_1",
      reason: "renamed",
    });
    expect(last().sourceRecordId).toBe("record_1");
    expect(db.fieldChanges.at(-1)).toMatchObject({ reason: "renamed" });
  });

  it("locks the row before it reads it", async () => {
    await create({ hostname: "ct-1" });
    db.findAsset.mockClear();
    await patch({ hostname: "ct-2" });
    expect(db.queryRaw).toHaveBeenCalledOnce();
    expect(db.queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      db.findAsset.mock.invocationCallOrder[0],
    );
  });

  it("throws on a field that the entity doesn't have", async () => {
    await create({ hostname: "ct-1" });
    const fields = { hostname: "ct-2", externalId: "x" };
    await expect(patch(fields)).rejects.toThrow('no field "externalId"');
    expect(kinds()).toEqual(["CREATE"]);
  });
});
