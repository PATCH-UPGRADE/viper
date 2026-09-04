// @vitest-environment node
import { describe, expect, it } from "vitest";
import { PlatformEnum, ResourceType } from "@/generated/prisma";
import {
  attachMappingUrls,
  type IntegrationUrlContext,
  type MappingPath,
  mappingPaths,
} from "../mapping-urls";
import type { UrlBuilders } from "../types";

describe("mappingPaths", () => {
  it("finds mappings selected on the operation's own model", () => {
    expect(
      mappingPaths("Asset", { include: { externalMappings: true } }),
    ).toEqual([{ path: ["externalMappings"], resource: ResourceType.Asset }]);
  });

  it("follows a nested relation, which renames the resource", () => {
    // The walk starts at Issue, which owns no mappings; the DMMF is what says
    // the `asset` hop lands on ExternalAssetMapping.
    expect(
      mappingPaths("Issue", {
        include: { asset: { include: { externalMappings: true } } },
      }),
    ).toEqual([
      { path: ["asset", "externalMappings"], resource: ResourceType.Asset },
    ]);
  });

  it("walks `select` as well as `include`", () => {
    expect(
      mappingPaths("Asset", {
        select: {
          id: true,
          externalMappings: { select: { externalId: true } },
        },
      }),
    ).toEqual([{ path: ["externalMappings"], resource: ResourceType.Asset }]);
  });

  it("resolves each hop by model, not by relation name", () => {
    // `assets` is Asset[] on Issue but AssetTicket[] here, and only the second
    // hop reaches a real Asset. Name-matching would mislabel the first.
    expect(
      mappingPaths("WorkOrderTicket", {
        include: {
          assets: {
            include: { asset: { include: { externalMappings: true } } },
          },
          externalMappings: true,
        },
      }),
    ).toEqual([
      {
        path: ["assets", "asset", "externalMappings"],
        resource: ResourceType.Asset,
      },
      { path: ["externalMappings"], resource: ResourceType.WorkOrder },
    ]);
  });

  it("finds a mapping relation that is not called `externalMappings`", () => {
    expect(
      mappingPaths("SourceRecord", { include: { mapping: true } }),
    ).toEqual([{ path: ["mapping"], resource: ResourceType.SourceRecord }]);
  });

  it("treats a mapping model queried directly as the root", () => {
    expect(mappingPaths("ExternalAssetMapping", {})).toEqual([
      { path: [], resource: ResourceType.Asset },
    ]);
  });

  it("ignores a relation named only in `where` — it is not in the result", () => {
    expect(
      mappingPaths("Asset", {
        where: { externalMappings: { some: { integrationId: "int-1" } } },
      }),
    ).toEqual([]);
  });

  it("ignores a relation written in `data` but never selected back", () => {
    expect(
      mappingPaths("Asset", {
        data: { externalMappings: { create: { externalId: "US_1" } } },
      }),
    ).toEqual([]);
  });

  it("ignores a deselected relation, and a query with no model", () => {
    expect(
      mappingPaths("Asset", { include: { externalMappings: false } }),
    ).toEqual([]);
    expect(
      mappingPaths(undefined, { include: { externalMappings: true } }),
    ).toEqual([]);
  });
});

// A stand-in platform module. The point is that resolution is wired up, not
// what any particular platform's URLs look like — those are tested next to the
// platform that owns them.
const BUILDERS: UrlBuilders<unknown> = {
  apiUrlFor: (externalId) => `https://fake.test/api/${externalId}`,
  webUrlFor: (externalId) => `https://fake.test/ui/${externalId}`,
};

const FLEET_CONTEXT: IntegrationUrlContext = {
  platform: PlatformEnum.FLEET,
  config: {},
};

const loader = (context: IntegrationUrlContext | undefined) => async () =>
  new Map(context ? [["int-1", context]] : []);

const resolver = (builders: UrlBuilders<unknown> | undefined) => async () =>
  builders;

const ASSET_MAPPINGS: MappingPath[] = [
  { path: ["externalMappings"], resource: ResourceType.Asset },
];

const mapping = (overrides: Record<string, unknown> = {}) => ({
  externalId: "US_3000438672",
  upstreamApi: null,
  webUrl: null,
  integration: { id: "int-1", name: "Fleet", platform: PlatformEnum.FLEET },
  ...overrides,
});

describe("attachMappingUrls", () => {
  it("resolves a mapping from the owning platform's module", async () => {
    const result = { id: "asset-1", externalMappings: [mapping()] };
    await attachMappingUrls(
      result,
      ASSET_MAPPINGS,
      loader(FLEET_CONTEXT),
      resolver(BUILDERS),
    );

    expect(result.externalMappings[0].webUrl).toBe(
      "https://fake.test/ui/US_3000438672",
    );
    expect(result.externalMappings[0].upstreamApi).toBe(
      "https://fake.test/api/US_3000438672",
    );
  });

  it("resolves every row of a findMany, and through a nested relation", async () => {
    const result = [
      { asset: { externalMappings: [mapping()] } },
      { asset: { externalMappings: [mapping({ externalId: "US_2" })] } },
    ];
    await attachMappingUrls(
      result,
      [{ path: ["asset", "externalMappings"], resource: ResourceType.Asset }],
      loader(FLEET_CONTEXT),
      resolver(BUILDERS),
    );

    expect(result.map((r) => r.asset.externalMappings[0].webUrl)).toEqual([
      "https://fake.test/ui/US_3000438672",
      "https://fake.test/ui/US_2",
    ]);
  });

  it("keeps a narrower select's shape, writing only the chosen fields", async () => {
    const narrow = {
      externalId: "US_3000438672",
      integration: { id: "int-1" },
    };
    const result = { externalMappings: [narrow] };
    await attachMappingUrls(
      result,
      ASSET_MAPPINGS,
      loader(FLEET_CONTEXT),
      resolver(BUILDERS),
    );

    expect(result.externalMappings[0]).not.toHaveProperty("webUrl");
    expect(result.externalMappings[0]).not.toHaveProperty("upstreamApi");
  });

  it("leaves webUrl null rather than repeating the API url", async () => {
    // The two render as separate links, so falling back would show the same
    // url twice.
    const result = { externalMappings: [mapping()] };
    await attachMappingUrls(
      result,
      ASSET_MAPPINGS,
      loader(FLEET_CONTEXT),
      resolver({ apiUrlFor: BUILDERS.apiUrlFor }),
    );

    expect(result.externalMappings[0].upstreamApi).toBe(
      "https://fake.test/api/US_3000438672",
    );
    expect(result.externalMappings[0].webUrl).toBeNull();
  });

  it("leaves stored values in place when the integration is unknown", async () => {
    const stored = mapping({ webUrl: "https://stored.example.com/x" });
    const result = { externalMappings: [stored] };
    await attachMappingUrls(
      result,
      ASSET_MAPPINGS,
      loader(undefined),
      resolver(BUILDERS),
    );

    expect(result.externalMappings[0].webUrl).toBe(
      "https://stored.example.com/x",
    );
  });

  it("leaves stored values in place when the platform has no module for the resource", async () => {
    const stored = mapping({ webUrl: "https://stored.example.com/x" });
    const result = { externalMappings: [stored] };
    await attachMappingUrls(
      result,
      ASSET_MAPPINGS,
      loader(FLEET_CONTEXT),
      resolver(undefined),
    );

    expect(result.externalMappings[0].webUrl).toBe(
      "https://stored.example.com/x",
    );
  });

  it("ignores a result that carries nothing at the given path", async () => {
    const result = { id: "asset-1", ip: "10.0.0.1" };
    await attachMappingUrls(
      result,
      ASSET_MAPPINGS,
      loader(FLEET_CONTEXT),
      resolver(BUILDERS),
    );

    expect(result).toEqual({ id: "asset-1", ip: "10.0.0.1" });
  });
});
