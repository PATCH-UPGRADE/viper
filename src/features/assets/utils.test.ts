import { describe, expect, it } from "vitest";
import {
  getAssetDeviceTypeLabel,
  getAssetDisplayName,
  getAssetNameForAgent,
  getAssetTitle,
} from "./utils";

const fleetCt = {
  id: "ct_63014",
  hostname: null,
  ip: null,
  serialNumber: "63014",
  role: "CT Acquisition Workstation",
  deviceGroup: {
    product: { deviceType: { displayName: "Computed Tomography (CT)" } },
  },
};

const scannedPump = {
  id: "pump_007",
  hostname: "icu-pump-07",
  ip: "10.20.0.7",
  serialNumber: "SN-PUMP-7",
  deviceGroup: null,
};

describe("getAssetDisplayName", () => {
  it("prefers the hostname", () => {
    expect(getAssetDisplayName(scannedPump)).toBe("icu-pump-07");
  });

  it("falls back to the ip when there is no hostname", () => {
    expect(getAssetDisplayName({ ...scannedPump, hostname: null })).toBe(
      "10.20.0.7",
    );
  });

  it("names a Fleet asset by its serial number when it has no hostname or ip", () => {
    expect(getAssetDisplayName(fleetCt)).toBe("63014");
  });

  it("falls back to the device type, never the role", () => {
    expect(getAssetDisplayName({ ...fleetCt, serialNumber: null })).toBe(
      "Computed Tomography (CT)",
    );
    expect(
      getAssetDisplayName({
        ...fleetCt,
        serialNumber: null,
        deviceGroup: null,
      }),
    ).toBe("ct_63014");
  });

  it("falls back to the id when every name is missing or blank", () => {
    expect(
      getAssetDisplayName({
        id: "ct_63014",
        hostname: "  ",
        ip: null,
        serialNumber: "",
        deviceGroup: null,
      }),
    ).toBe("ct_63014");
  });
});

describe("getAssetNameForAgent", () => {
  it("falls back to the role, for agents and external platforms", () => {
    expect(getAssetNameForAgent({ ...fleetCt, serialNumber: null })).toBe(
      "CT Acquisition Workstation",
    );
  });
});

describe("getAssetTitle", () => {
  it("is the device type, never the role", () => {
    expect(getAssetTitle(fleetCt)).toBe("Computed Tomography (CT)");
  });

  it("is Unknown Asset when the product has no device type", () => {
    expect(getAssetTitle({ deviceGroup: { product: null } })).toBe(
      "Unknown Asset",
    );
  });
});

describe("getAssetDeviceTypeLabel", () => {
  it("reads the device type of the asset's product", () => {
    expect(
      getAssetDeviceTypeLabel({
        deviceGroup: {
          product: { deviceType: { displayName: "Infusion Pump" } },
        },
      }),
    ).toBe("Infusion Pump");
  });

  it.each([
    ["no device type", { product: { deviceType: null } }],
    ["no product", { product: null }],
    ["no device group", null],
  ])("returns null for %s", (_, deviceGroup) => {
    expect(getAssetDeviceTypeLabel({ deviceGroup })).toBeNull();
  });
});
