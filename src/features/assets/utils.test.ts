import { describe, expect, it } from "vitest";
import {
  getAssetDeviceTypeLabel,
  getAssetDisplayName,
  getAssetIdentifier,
  getAssetNameForAgent,
  getAssetTitle,
  securityRemediationsOf,
} from "./utils";

const fleetCt = {
  id: "ct_63014",
  hostname: null,
  ip: null,
  serialNumber: "63014",
  role: "CT Acquisition Workstation",
  product: { deviceType: { displayName: "Computed Tomography (CT)" } },
};

const scannedPump = {
  id: "pump_007",
  hostname: "icu-pump-07",
  ip: "10.20.0.7",
  serialNumber: "SN-PUMP-7",
  product: null,
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
        product: null,
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
        product: null,
      }),
    ).toBe("ct_63014");
  });
});

describe("getAssetIdentifier", () => {
  it("tells assets of one device type apart, never by type or role", () => {
    expect(getAssetIdentifier(scannedPump)).toBe("icu-pump-07");
    expect(getAssetIdentifier(fleetCt)).toBe("63014");
    expect(getAssetIdentifier({ ...fleetCt, serialNumber: null })).toBe(
      "ct_63014",
    );
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

  it("is Unknown Asset when the asset has no product", () => {
    expect(getAssetTitle({ product: null })).toBe("Unknown Asset");
  });
});

describe("getAssetDeviceTypeLabel", () => {
  it("reads the device type of the asset's product", () => {
    expect(
      getAssetDeviceTypeLabel({
        product: { deviceType: { displayName: "Infusion Pump" } },
      }),
    ).toBe("Infusion Pump");
  });

  it.each([
    ["no device type", { product: { deviceType: null } }],
    ["no product", { product: null }],
    ["no asset", null],
  ])("returns null for %s", (_, asset) => {
    expect(getAssetDeviceTypeLabel(asset)).toBeNull();
  });
});

describe("securityRemediationsOf", () => {
  const rem = (id: string, isSecurityUpdate: boolean | null) => ({
    id,
    isSecurityUpdate,
    _count: { vulnerabilities: 1 },
  });

  it("lists each remediation once across issues", () => {
    const a = rem("a", null);
    expect(
      securityRemediationsOf([
        { vulnerability: { remediations: [a] } },
        { vulnerability: { remediations: [a] } },
      ]),
    ).toEqual([a]);
  });
  it("leaves out one a source stated is not a security update", () => {
    const general = rem("g", false);
    const security = rem("s", true);
    expect(
      securityRemediationsOf([
        { vulnerability: { remediations: [general, security] } },
      ]),
    ).toEqual([security]);
  });
});
