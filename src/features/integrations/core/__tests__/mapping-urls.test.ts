// @vitest-environment node
import { describe, expect, it } from "vitest";
import { PlatformEnum } from "@/generated/prisma";
import {
  attachMappingUrls,
  type IntegrationUrlContext,
  selectsExternalMappings,
} from "../mapping-urls";

const FLEET_INTEGRATION: IntegrationUrlContext = {
  platform: PlatformEnum.FLEET,
  config: {},
};

const loader = (context: IntegrationUrlContext | undefined) => async () =>
  new Map(context ? [["int-1", context]] : []);

const mapping = (overrides: Record<string, unknown> = {}) => ({
  externalId: "US_3000438672",
  upstreamApi: null,
  webUrl: null,
  integration: { id: "int-1", name: "Fleet", platform: PlatformEnum.FLEET },
  ...overrides,
});

const WEB_URL =
  "https://fleet.siemens-healthineers.com/equipment/US_3000438672/info";
const API_URL = "https://fleet.siemens-healthineers.com/rest/v1/equipments";

describe("selectsExternalMappings", () => {
  it("finds the key at any depth of the query args", () => {
    expect(
      selectsExternalMappings({
        include: { deviceGroup: { include: { externalMappings: true } } },
      }),
    ).toBe(true);
  });

  it("is false for a query that never mentions them", () => {
    expect(selectsExternalMappings({ where: { id: "a" } })).toBe(false);
    expect(selectsExternalMappings(undefined)).toBe(false);
  });
});

describe("attachMappingUrls", () => {
  it("resolves a top-level asset's mappings from the Fleet module", async () => {
    const result = { id: "asset-1", externalMappings: [mapping()] };
    await attachMappingUrls(result, "Asset", loader(FLEET_INTEGRATION));

    expect(result.externalMappings[0].webUrl).toBe(WEB_URL);
    expect(result.externalMappings[0].upstreamApi).toBe(API_URL);
  });

  it("resolves through a nested relation, which renames the resource", async () => {
    // The walk starts at Issue, which owns no mappings; the `asset` key is what
    // tells it these belong to the Asset resource module.
    const result = { id: "issue-1", asset: { externalMappings: [mapping()] } };
    await attachMappingUrls(result, "Issue", loader(FLEET_INTEGRATION));

    expect(result.asset.externalMappings[0].webUrl).toBe(WEB_URL);
  });

  it("keeps a narrower select's shape, writing only the chosen fields", async () => {
    const narrow = {
      externalId: "US_3000438672",
      integration: { id: "int-1" },
    };
    const result = { externalMappings: [narrow] };
    await attachMappingUrls(result, "Asset", loader(FLEET_INTEGRATION));

    expect(result.externalMappings[0]).not.toHaveProperty("webUrl");
    expect(result.externalMappings[0]).not.toHaveProperty("upstreamApi");
  });

  it("leaves stored values in place when the integration is unknown", async () => {
    const stored = mapping({ webUrl: "https://stored.example.com/x" });
    const result = { externalMappings: [stored] };
    await attachMappingUrls(result, "Asset", loader(undefined));

    expect(result.externalMappings[0].webUrl).toBe(
      "https://stored.example.com/x",
    );
  });

  it("ignores a result with no mappings at all", async () => {
    const result = { id: "asset-1", ip: "10.0.0.1" };
    await attachMappingUrls(result, "Asset", loader(FLEET_INTEGRATION));

    expect(result).toEqual({ id: "asset-1", ip: "10.0.0.1" });
  });
});
