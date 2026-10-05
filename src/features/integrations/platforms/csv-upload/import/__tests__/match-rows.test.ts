import { describe, expect, it } from "vitest";
import type { MatchKeysRow } from "../../contract";
import { type ContextAsset, type MatchContext, matchRowsToDevices } from "../match-rows";

const keysRow = (overrides: Partial<MatchKeysRow>): MatchKeysRow => ({
  rowNumber: 2,
  manufacturer: "GE Healthcare",
  product: "LOGIQ e",
  serialNumber: null,
  macAddress: null,
  hostname: null,
  ...overrides,
});

const viperAsset = (overrides: Partial<ContextAsset>): ContextAsset => ({
  id: "asset-1",
  label: "GE HealthCare LOGIQ e · Ultrasound",
  platforms: ["Partner API"],
  serialNumber: null,
  macAddress: null,
  hostname: null,
  ip: null,
  networkSegment: null,
  role: null,
  status: null,
  location: null,
  ...overrides,
});

const contextOf = (...assets: ContextAsset[]): MatchContext => ({
  assets: new Map(assets.map((asset) => [asset.id, asset])),
});

const noConflicts = new Map<number, string>();

describe("matchRowsToDevices — adding and linking", () => {
  it("adds a row that matches nothing in VIPER", () => {
    const outcomes = matchRowsToDevices(
      [keysRow({ serialNumber: "GE-LQ-2019-001" })],
      contextOf(),
      noConflicts,
    );

    expect(outcomes).toEqual([{ kind: "add", rowNumber: 2 }]);
  });

  it("links a row to the one device with its serial", () => {
    const outcomes = matchRowsToDevices(
      [keysRow({ serialNumber: "GE-LQ-2019-001" })],
      contextOf(
        viperAsset({ id: "rad-us-001", serialNumber: "GE-LQ-2019-001" }),
      ),
      noConflicts,
    );

    expect(outcomes).toEqual([
      { kind: "link", rowNumber: 2, assetId: "rad-us-001" },
    ]);
  });

  it("links by MAC address when the row has no serial", () => {
    const outcomes = matchRowsToDevices(
      [keysRow({ macAddress: "00:1A:2B:3C:4D:5E" })],
      contextOf(
        viperAsset({
          id: "mon-7",
          serialNumber: "DE71234567",
          macAddress: "00:1A:2B:3C:4D:5E",
        }),
      ),
      noConflicts,
    );

    expect(outcomes[0]).toEqual({
      kind: "link",
      rowNumber: 2,
      assetId: "mon-7",
    });
  });

  it("links by MAC address when the device has no serial on record", () => {
    const outcomes = matchRowsToDevices(
      [keysRow({ serialNumber: "BD-240118", macAddress: "00:1A:2B:3C:4D:5E" })],
      contextOf(viperAsset({ id: "pump-3", macAddress: "00:1A:2B:3C:4D:5E" })),
      noConflicts,
    );

    expect(outcomes[0]).toEqual({
      kind: "link",
      rowNumber: 2,
      assetId: "pump-3",
    });
  });

  it("links when serial and MAC address name the same device", () => {
    const outcomes = matchRowsToDevices(
      [keysRow({ serialNumber: "S-418220", macAddress: "00:AA:BB:CC:DD:EE" })],
      contextOf(
        viperAsset({
          id: "ct-1",
          serialNumber: "S-418220",
          macAddress: "00:AA:BB:CC:DD:EE",
        }),
      ),
      noConflicts,
    );

    expect(outcomes[0]).toEqual({
      kind: "link",
      rowNumber: 2,
      assetId: "ct-1",
    });
  });

  it("matches by hostname only when the row has neither serial nor MAC", () => {
    const workstation = viperAsset({ id: "ws-1", hostname: "ws-icu-01" });

    const outcomes = matchRowsToDevices(
      [
        keysRow({ rowNumber: 2, hostname: "ws-icu-01" }),
        keysRow({ rowNumber: 3, serialNumber: "NEW-1", hostname: "ws-icu-01" }),
      ],
      contextOf(workstation),
      noConflicts,
    );

    expect(outcomes).toEqual([
      { kind: "link", rowNumber: 2, assetId: "ws-1" },
      { kind: "add", rowNumber: 3 },
    ]);
  });
});

describe("matchRowsToDevices — rows that fail", () => {
  const carbonGateway = viperAsset({
    id: "fleet-gateway",
    serialNumber: "100153",
    macAddress: "00:00:00:00:01:53",
  });
  const carbonSolution = viperAsset({
    id: "fleet-solution",
    serialNumber: "100153",
  });

  it("fails a serial that two devices in VIPER share", () => {
    const outcomes = matchRowsToDevices(
      [keysRow({ serialNumber: "100153" })],
      contextOf(carbonGateway, carbonSolution),
      noConflicts,
    );

    expect(outcomes[0]).toEqual({
      kind: "fail",
      rowNumber: 2,
      reason: "Serial matches 2 devices in VIPER",
    });
  });

  it("keeps failing a shared serial even when the MAC address points at one part", () => {
    const outcomes = matchRowsToDevices(
      [keysRow({ serialNumber: "100153", macAddress: "00:00:00:00:01:53" })],
      contextOf(carbonGateway, carbonSolution),
      noConflicts,
    );

    expect(outcomes[0]).toMatchObject({
      kind: "fail",
      reason: "Serial matches 2 devices in VIPER",
    });
  });

  it("fails a MAC address that two devices in VIPER share", () => {
    const outcomes = matchRowsToDevices(
      [keysRow({ macAddress: "00:1A:2B:3C:4D:5E" })],
      contextOf(
        viperAsset({ id: "a", macAddress: "00:1A:2B:3C:4D:5E" }),
        viperAsset({ id: "b", macAddress: "00:1A:2B:3C:4D:5E" }),
      ),
      noConflicts,
    );

    expect(outcomes[0]).toMatchObject({
      kind: "fail",
      reason: "MAC address matches 2 devices in VIPER",
    });
  });

  it("fails a hostname that two devices in VIPER share", () => {
    const outcomes = matchRowsToDevices(
      [keysRow({ hostname: "ws-icu-01" })],
      contextOf(
        viperAsset({ id: "a", hostname: "ws-icu-01" }),
        viperAsset({ id: "b", hostname: "ws-icu-01" }),
        viperAsset({ id: "c", hostname: "ws-icu-01" }),
      ),
      noConflicts,
    );

    expect(outcomes[0]).toMatchObject({
      kind: "fail",
      reason: "Hostname matches 3 devices in VIPER",
    });
  });

  it("fails a row whose serial and MAC address belong to different devices", () => {
    const outcomes = matchRowsToDevices(
      [keysRow({ serialNumber: "S-418220", macAddress: "00:1A:2B:3C:4D:5E" })],
      contextOf(
        viperAsset({ id: "ct-1", serialNumber: "S-418220" }),
        viperAsset({ id: "mon-7", macAddress: "00:1A:2B:3C:4D:5E" }),
      ),
      noConflicts,
    );

    expect(outcomes[0]).toMatchObject({
      kind: "fail",
      reason: "Serial and MAC address belong to different devices in VIPER",
    });
  });

  it("fails a MAC address held by a device with a different serial", () => {
    const outcomes = matchRowsToDevices(
      [keysRow({ serialNumber: "BD-240118", macAddress: "00:1A:2B:3C:4D:5E" })],
      contextOf(
        viperAsset({
          id: "pump-9",
          serialNumber: "BD-999999",
          macAddress: "00:1A:2B:3C:4D:5E",
        }),
      ),
      noConflicts,
    );

    expect(outcomes[0]).toMatchObject({
      kind: "fail",
      reason: "MAC address already assigned to another asset",
    });
  });

  it("fails the second row that would link to the same device", () => {
    const outcomes = matchRowsToDevices(
      [
        keysRow({ rowNumber: 2, serialNumber: "S-418220" }),
        keysRow({ rowNumber: 7, hostname: "ct-scanner-1" }),
      ],
      contextOf(
        viperAsset({
          id: "ct-1",
          serialNumber: "S-418220",
          hostname: "ct-scanner-1",
        }),
      ),
      noConflicts,
    );

    expect(outcomes).toEqual([
      { kind: "link", rowNumber: 2, assetId: "ct-1" },
      {
        kind: "fail",
        rowNumber: 7,
        reason: "Row 2 already links to this device",
      },
    ]);
  });

  it("passes an in-file conflict through without matching the row", () => {
    const outcomes = matchRowsToDevices(
      [keysRow({ rowNumber: 214, serialNumber: "S-418220" })],
      contextOf(viperAsset({ id: "ct-1", serialNumber: "S-418220" })),
      new Map([[214, "Serial also used by row 88 in this file"]]),
    );

    expect(outcomes[0]).toEqual({
      kind: "fail",
      rowNumber: 214,
      reason: "Serial also used by row 88 in this file",
    });
  });

  it("lets a later row link a device that a failed row also matched", () => {
    const outcomes = matchRowsToDevices(
      [
        keysRow({ rowNumber: 2, product: null, serialNumber: "S-418220" }),
        keysRow({ rowNumber: 3, hostname: "ct-scanner-1" }),
      ],
      contextOf(
        viperAsset({
          id: "ct-1",
          serialNumber: "S-418220",
          hostname: "ct-scanner-1",
        }),
      ),
      new Map([[2, "Model is missing"]]),
    );

    expect(outcomes[1]).toEqual({
      kind: "link",
      rowNumber: 3,
      assetId: "ct-1",
    });
  });
});
