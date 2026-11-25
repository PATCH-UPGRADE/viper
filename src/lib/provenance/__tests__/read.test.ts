// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { attachSources } from "../read";

vi.mock("server-only", () => ({}));
const { db } = vi.hoisted(() => ({
  db: {
    observation: { groupBy: vi.fn() },
    integration: { findMany: vi.fn() },
    user: { findMany: vi.fn() },
  },
}));
vi.mock("@/lib/db", () => ({ default: db }));

const group = (overrides: Record<string, unknown>) => ({
  entityId: "a1",
  kind: "SNAPSHOT",
  source: "INTEGRATION",
  integrationId: null,
  integrationName: null,
  actorUserId: null,
  ...overrides,
});
const fleet = { integrationId: "fleet", integrationName: "Old name" };
const fleetSource = {
  source: "INTEGRATION",
  integrationId: "fleet",
  name: "Fleet",
  platform: "FLEET",
};

beforeEach(() => {
  vi.clearAllMocks();
  db.integration.findMany.mockResolvedValue([
    { id: "fleet", name: "Fleet", platform: "FLEET" },
  ]);
  db.user.findMany.mockResolvedValue([{ id: "u1", name: "Ada" }]);
});

describe("attachSources", () => {
  it("gives each entity its own sources and creator", async () => {
    db.observation.groupBy.mockResolvedValue([
      group({ kind: "PATCH", source: "MANUAL", actorUserId: "u1" }),
      group({ ...fleet, kind: "SNAPSHOT" }),
      group({ ...fleet, kind: "CREATE" }),
      group({
        entityId: "a2",
        kind: "CREATE",
        source: "API_CLIENT",
        actorUserId: "u1",
      }),
    ]);
    const ada = { id: "u1", name: "Ada" };

    expect(
      await attachSources("ASSET", [{ id: "a1" }, { id: "a2" }, { id: "a3" }]),
    ).toEqual([
      {
        id: "a1",
        sources: [{ source: "MANUAL", actor: ada }, fleetSource],
        creator: fleetSource,
      },
      {
        id: "a2",
        sources: [{ source: "API_CLIENT", actor: ada }],
        creator: { source: "API_CLIENT", actor: ada },
      },
      { id: "a3", sources: [], creator: null },
    ]);
    expect(db.observation.groupBy).toHaveBeenCalledTimes(1);
    expect(db.integration.findMany).toHaveBeenCalledTimes(1);
    expect(db.user.findMany).toHaveBeenCalledTimes(1);
  });

  it("lists an integration once, whoever the actor was and whatever its name was", async () => {
    db.observation.groupBy.mockResolvedValue([
      group({ ...fleet, actorUserId: "u1" }),
      group({ ...fleet, integrationName: "Older name" }),
    ]);
    const [asset] = await attachSources("ASSET", [{ id: "a1" }]);
    expect(asset.sources).toEqual([fleetSource]);
  });

  it("keeps the name of a deleted integration, and that a deleted user wrote", async () => {
    db.observation.groupBy.mockResolvedValue([
      group({ integrationName: "Gone" }),
      group({ kind: "CREATE", source: "MANUAL" }),
    ]);
    const [asset] = await attachSources("ASSET", [{ id: "a1" }]);
    expect(asset.sources).toEqual([
      {
        source: "INTEGRATION",
        integrationId: null,
        name: "Gone",
        platform: null,
      },
      { source: "MANUAL", actor: null },
    ]);
    expect(asset.creator).toEqual({ source: "MANUAL", actor: null });
  });

  it("doesn't name an actor for automation and email", async () => {
    db.observation.groupBy.mockResolvedValue([
      group({ kind: "PATCH", source: "AUTOMATION", actorUserId: "u1" }),
      group({ kind: "PATCH", source: "EMAIL", actorUserId: "u1" }),
    ]);
    const [asset] = await attachSources("ASSET", [{ id: "a1" }]);
    expect(asset.sources).toEqual([
      { source: "AUTOMATION" },
      { source: "EMAIL" },
    ]);
  });

  it("runs no query for no items", async () => {
    expect(await attachSources("ASSET", [])).toEqual([]);
    expect(db.observation.groupBy).not.toHaveBeenCalled();
  });
});
