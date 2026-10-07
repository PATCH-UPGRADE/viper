import { describe, expect, it } from "vitest";
import { PlatformEnum } from "@/generated/prisma";
import { getAssetDisplayName, getSourceToolLabel } from "./utils";

const fleetCt = {
  id: "ct_63014",
  hostname: null,
  ip: null,
  serialNumber: "63014",
  role: "Computed Tomography (CT)",
};

const scannedPump = {
  id: "pump_007",
  hostname: "icu-pump-07",
  ip: "10.20.0.7",
  serialNumber: "SN-PUMP-7",
  role: "Infusion Pump",
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

  it("falls back to the role when the serial number is missing", () => {
    expect(getAssetDisplayName({ ...fleetCt, serialNumber: null })).toBe(
      "Computed Tomography (CT)",
    );
  });

  it("falls back to the id when every name is missing or blank", () => {
    expect(
      getAssetDisplayName({
        id: "ct_63014",
        hostname: "  ",
        ip: null,
        serialNumber: "",
        role: undefined,
      }),
    ).toBe("ct_63014");
  });
});

describe("getSourceToolLabel", () => {
  const mappedTo = (platform: PlatformEnum) => ({ integration: { platform } });

  it("names CSV Upload for a device only a CSV upload reports", () => {
    expect(
      getSourceToolLabel({
        user: { name: "Dana Reyes" },
        externalMappings: [mappedTo(PlatformEnum.CSV_UPLOAD)],
      }),
    ).toBe("CSV Upload");
  });

  it("keeps the owning tool's name when another platform also reports the device", () => {
    expect(
      getSourceToolLabel({
        user: { name: "teamplay Fleet" },
        externalMappings: [
          mappedTo(PlatformEnum.FLEET),
          mappedTo(PlatformEnum.CSV_UPLOAD),
        ],
      }),
    ).toBe("teamplay Fleet");
  });

  it("shows the owner's name for a device no integration reports", () => {
    expect(
      getSourceToolLabel({
        user: { name: "Dana Reyes" },
        externalMappings: [],
      }),
    ).toBe("Dana Reyes");
  });
});
