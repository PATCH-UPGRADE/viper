// @vitest-environment node
import { describe, it, vi } from "vitest";
import type prisma from "@/lib/db";
import type { TransactionClient } from "@/lib/db";
import { assetEntity } from "../asset";
import type { ApplyUnit } from "../entities";
import type { FieldMap, ObservationOrigin } from "../types";
import type { ApplyObservationParams, applyObservation } from "../write";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ default: {} }));

/** Type tests: `tsc --noEmit` fails on an unused `@ts-expect-error`. */
describe("provenance types", () => {
  it("requires each field of a model in its map, and no others", () => {
    const { serialNumber: _, ...missing } = assetEntity.fields;
    // @ts-expect-error serialNumber has no mark
    missing satisfies FieldMap<"Asset">;

    ({
      ...assetEntity.fields,
      // @ts-expect-error not a field of Asset
      removedColumn: "tracked",
    }) satisfies FieldMap<"Asset">;

    ({
      ...assetEntity.fields,
      // @ts-expect-error not a mark
      serialNumber: "other",
    }) satisfies FieldMap<"Asset">;
  });

  it("requires what each source needs", () => {
    const integration = {
      source: "INTEGRATION",
      integrationId: "i",
      integrationName: "Fleet",
    } as const;
    ({ ...integration, observedAt: new Date() }) satisfies ObservationOrigin;
    // @ts-expect-error no observedAt
    integration satisfies ObservationOrigin;

    const { integrationName: _, ...unnamed } = integration;
    // @ts-expect-error no integrationName
    ({ ...unnamed, observedAt: new Date() }) satisfies ObservationOrigin;

    // @ts-expect-error no actor
    ({ source: "MANUAL" }) satisfies ObservationOrigin;
  });

  it("only lets an integration write a SNAPSHOT", () => {
    const write = {
      entityType: "ASSET",
      entityId: "a",
      fields: {},
      origin: { source: "MANUAL", actorUserId: "u" },
    } as const;
    ({ ...write, kind: "PATCH" }) satisfies ApplyObservationParams<"ASSET">;
    // @ts-expect-error a person can't write a SNAPSHOT
    ({ ...write, kind: "SNAPSHOT" }) satisfies ApplyObservationParams<"ASSET">;
  });

  it("requires all four device fields or none", () => {
    type Fields = ApplyObservationParams<"ASSET">["fields"];
    const device = {
      manufacturerId: "m",
      productId: null,
      versionId: null,
      versionStatus: "UNKNOWN",
    } as const;
    ({ hostname: "h" }) satisfies Fields;
    ({ hostname: "h", ...device }) satisfies Fields;

    const { versionId: _, ...partial } = device;
    // @ts-expect-error no versionId
    ({ hostname: "h", ...partial }) satisfies Fields;
  });

  it("applies a group as a whole", () => {
    ["serialNumber", "device"] satisfies ApplyUnit<"ASSET">[];
    // @ts-expect-error part of the device group
    ["productId"] satisfies ApplyUnit<"ASSET">[];
    // @ts-expect-error an ignored field is always written
    ["role"] satisfies ApplyUnit<"ASSET">[];
  });

  it("takes a transaction and not the client", () => {
    type Tx = Parameters<typeof applyObservation>[0];
    ((tx: TransactionClient): Tx => tx) satisfies unknown;
    // @ts-expect-error a lock needs a transaction
    ((client: typeof prisma): Tx => client) satisfies unknown;
  });
});
