// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { createAgentCaller } from "@/trpc/agent-caller";
import {
  addNavigationLinks,
  capPageSize,
  PLATFORM_CATALOG,
  PLATFORM_QUERY_PROCEDURES,
} from "./query-platform-tool";

/** Every catalog bullet starts `- <router>.<procedure> — …`. */
const CATALOG_LINE = /^- ([a-zA-Z]+\.[a-zA-Z]+) —/gm;

function documentedProcedures(): string[] {
  return [...PLATFORM_CATALOG.matchAll(CATALOG_LINE)].map((m) => m[1]);
}

describe("PLATFORM_CATALOG stays in sync with PLATFORM_QUERY_PROCEDURES", () => {
  // The allowlist is what the model *can* call; the catalog is what it is *told*
  // it can call. They are maintained by hand in the same file, so they drift
  // silently: an undocumented procedure is unreachable in practice, and a
  // documented one that isn't allowlisted makes the model retry a call that
  // can never succeed.
  // Array equality covers all three ways these drift: an allowlisted procedure
  // with no catalog entry, a catalog entry for something not allowlisted, and a
  // duplicate bullet. It also pins the catalog to the enum's order.
  it("documents exactly the allowlisted procedures, in order", () => {
    expect(documentedProcedures()).toEqual([...PLATFORM_QUERY_PROCEDURES]);
  });

  // A typo in a dot-path, or a procedure later renamed in its router, is
  // invisible until an agent calls it and gets back "Unknown procedure".
  // Resolve each path the same way the tool does, so drift fails here instead.
  it("resolves every allowlisted procedure on the tRPC caller", () => {
    const caller = createAgentCaller("test-user") as unknown as Record<
      string,
      unknown
    >;

    const unresolved = PLATFORM_QUERY_PROCEDURES.filter((procedure) => {
      const resolved = procedure
        .split(".")
        .reduce<unknown>(
          (obj, key) => (obj as Record<string, unknown> | undefined)?.[key],
          caller,
        );
      return typeof resolved !== "function";
    });

    expect(unresolved).toEqual([]);
  });
});

describe("capPageSize", () => {
  // notifications.getMany fans out one deviceGroup.findMany per matching per
  // row. At pageSize 100 with ~18 matchings an advisory that is ~1800
  // concurrent queries against a pool of ~17, which throws P2024 and starves
  // the UI. The catalog says the same thing, but prose does not bind a model.
  it("clamps an over-large notifications page", () => {
    expect(capPageSize("notifications.getMany", { pageSize: 100 })).toEqual({
      pageSize: 10,
    });
  });

  it("keeps the rest of the input intact", () => {
    expect(
      capPageSize("notifications.getMany", {
        pageSize: 50,
        search: "siemens",
        priority: ["Critical"],
      }),
    ).toEqual({ pageSize: 10, search: "siemens", priority: ["Critical"] });
  });

  it("leaves a request at or under the cap alone", () => {
    const input = { pageSize: 10, page: 3 };

    expect(capPageSize("notifications.getMany", input)).toBe(input);
  });

  it("leaves uncapped procedures alone", () => {
    const input = { pageSize: 100 };

    expect(capPageSize("assets.getMany", input)).toBe(input);
  });

  it("passes through input with no pageSize, and undefined", () => {
    const input = { search: "pump" };

    expect(capPageSize("notifications.getMany", input)).toBe(input);
    expect(capPageSize("notifications.getMany", undefined)).toBeUndefined();
  });
});

describe("the tool applies the cap, not just the helper", () => {
  afterEach(() => {
    vi.doUnmock("@/trpc/agent-caller");
    vi.resetModules();
  });

  // Testing capPageSize alone leaves the wiring untested: deleting the call in
  // makeQueryPlatformDataTool keeps every other test green. Mock the caller and
  // assert what tRPC actually receives.
  it("clamps the input that reaches tRPC", async () => {
    vi.resetModules();
    const getMany = vi.fn().mockResolvedValue({ items: [], totalCount: 0 });
    vi.doMock("@/trpc/agent-caller", () => ({
      createAgentCaller: () => ({ notifications: { getMany } }),
    }));

    const { makeQueryPlatformDataTool } = await import("./query-platform-tool");
    await makeQueryPlatformDataTool("user_1").invoke({
      procedure: "notifications.getMany",
      input: { pageSize: 100, search: "siemens" },
    });

    expect(getMany).toHaveBeenCalledWith({ pageSize: 10, search: "siemens" });
  });
});

describe("addNavigationLinks — notifications", () => {
  // hospitalImpact is the discriminator: it exists only on Notification.
  const notification = () => ({
    id: "notif_1",
    title: "Vendor advisory",
    hospitalImpact: { byline: "Two ICU pumps affected" },
  });

  it("points a notification at its detail call", () => {
    const result = addNavigationLinks(notification()) as {
      _links: { detail: { procedure: string; input: { id: string } } };
    };

    expect(result._links.detail).toEqual({
      procedure: "notifications.getOne",
      input: { id: "notif_1" },
    });
  });

  it("links notifications nested in a paginated list", () => {
    const page = { items: [notification()], meta: { page: 1 } };

    const result = addNavigationLinks(page) as {
      items: { _links: { detail: { input: { id: string } } } }[];
    };

    expect(result.items[0]._links.detail.input.id).toBe("notif_1");
  });

  it("does not point the detail result back at itself", () => {
    // affectedAssets is only on the getOne payload. A "detail" link there is a
    // call that returns what the model already holds.
    const detail = { ...notification(), affectedAssets: { AFFECTED: [] } };

    const result = addNavigationLinks(detail) as { _links?: unknown };

    expect(result._links).toBeUndefined();
  });

  it("leaves objects without hospitalImpact alone", () => {
    const remediation = { id: "rem_1", description: "Apply firmware M.02.07" };

    const result = addNavigationLinks(remediation) as {
      _links?: unknown;
    };

    expect(result._links).toBeUndefined();
  });

  it("does not clobber links added by another transform", () => {
    // An asset carries _links.workflows; a notification-shaped object should
    // only ever add to that map, never replace it.
    const hybrid = {
      id: "a_1",
      utilization: { "0": 10 },
      hospitalImpact: {},
    };

    const result = addNavigationLinks(hybrid) as {
      _links: Record<string, unknown>;
    };

    expect(Object.keys(result._links).sort()).toEqual([
      "detail",
      "utilization",
      "workflows",
    ]);
  });
});

describe("addNavigationLinks — source payload stripping", () => {
  // NotificationSource.raw is the whole inbound email event, tens of KB per row.
  // The notification's own title and summary carry what the model reads, and on
  // the detail call the source keeps its markdown.
  const source = () => ({
    id: "src_1",
    channel: "Email",
    raw: { from: "vendor@example.com", html: "<html>…40KB…</html>" },
    markdown: "Vendor advisory body",
    receivedAt: "2026-08-13T00:00:00.000Z",
  });

  it("drops raw but keeps the fields the model reads", () => {
    const result = addNavigationLinks(source()) as Record<string, unknown>;

    expect(result).not.toHaveProperty("raw");
    expect(result.markdown).toBe("Vendor advisory body");
    expect(result.channel).toBe("Email");
    expect(result.id).toBe("src_1");
  });

  it("strips raw from sources nested under a notification", () => {
    const notification = {
      id: "notif_1",
      hospitalImpact: {},
      sources: [source(), source()],
    };

    const result = addNavigationLinks(notification) as {
      sources: Record<string, unknown>[];
    };

    for (const s of result.sources) {
      expect(s).not.toHaveProperty("raw");
    }
  });

  it("strips raw from work order ticket sources too", () => {
    // WorkOrderTicket.sources is the same NotificationSource shape under a
    // different parent, which is why this keys off the source, not the parent.
    const ticket = { id: "wot_1", summary: "Patch pumps", sources: [source()] };

    const result = addNavigationLinks(ticket) as {
      sources: Record<string, unknown>[];
    };

    expect(result.sources[0]).not.toHaveProperty("raw");
  });

  it("leaves a `raw` field alone when the object is not a source", () => {
    const notASource = { id: "x_1", raw: "keep me" };

    const result = addNavigationLinks(notASource) as { raw?: string };

    expect(result.raw).toBe("keep me");
  });
});

describe("addNavigationLinks — canonical record trimming", () => {
  // The same record repeats once per row that references it, so a vendor
  // advisory with 18 matchings sends the identical manufacturer 18 times. The
  // transform is shape-blind, so one fixture carrying every noise key covers
  // Manufacturer, Product, Version, and Vendor. `versScheme` lives on Version.
  const manufacturer = () => ({
    id: "mfr_1",
    canonicalName: "siemens healthineers",
    canonicalDisplayName: "Siemens Healthineers",
    hasCpe: true,
    nameMappings: [],
    versScheme: null,
    createdAt: "2026-08-13T14:23:04.179Z",
    updatedAt: "2026-08-13T14:23:04.179Z",
  });

  it("drops every noise key and keeps the id and both names", () => {
    const result = addNavigationLinks(manufacturer()) as Record<
      string,
      unknown
    >;

    for (const key of [
      "hasCpe",
      "nameMappings",
      "versScheme",
      "createdAt",
      "updatedAt",
    ]) {
      expect(result).not.toHaveProperty(key);
    }
    // The catalog tells the model to find a device group by these names.
    expect(result.id).toBe("mfr_1");
    expect(result.canonicalName).toBe("siemens healthineers");
    expect(result.canonicalDisplayName).toBe("Siemens Healthineers");
  });

  it("trims records nested inside a notification's matchings", () => {
    const notification = {
      id: "notif_1",
      hospitalImpact: {},
      deviceGroupsMatchings: [
        { deviceGroupMatching: { manufacturer: manufacturer() } },
        { deviceGroupMatching: { manufacturer: manufacturer() } },
      ],
    };

    const result = addNavigationLinks(notification) as {
      deviceGroupsMatchings: {
        deviceGroupMatching: { manufacturer: Record<string, unknown> };
      }[];
    };

    for (const m of result.deviceGroupsMatchings) {
      expect(m.deviceGroupMatching.manufacturer).not.toHaveProperty("hasCpe");
      expect(m.deviceGroupMatching.manufacturer.canonicalDisplayName).toBe(
        "Siemens Healthineers",
      );
    }
  });

  it("leaves an object that is not a canonical record alone", () => {
    // An asset also has createdAt, but it is not a lookup record.
    const asset = { id: "a_1", hostname: "icu-01", createdAt: "2026-01-01" };

    const result = addNavigationLinks(asset) as Record<string, unknown>;

    expect(result.createdAt).toBe("2026-01-01");
  });
});

describe("addNavigationLinks — existing behaviour is preserved", () => {
  it("still linkifies assets", () => {
    const asset = { id: "a_1", hostname: "icu-01", utilization: { "0": 10 } };

    const result = addNavigationLinks(asset) as {
      utilization?: unknown;
      _links: Record<string, { procedure: string }>;
    };

    expect(result.utilization).toBeUndefined();
    expect(result._links.workflows.procedure).toBe("workflows.getManyByAsset");
    expect(result._links.utilization.procedure).toBe("assets.getUtilization");
  });

  it("still linkifies device groups and strips their href keys", () => {
    const deviceGroup = {
      id: "dg_1",
      assetsUrl: "https://example.test/dg/1/assets",
      vulnerabilitiesUrl: "https://example.test/dg/1/vulns",
    };

    const result = addNavigationLinks(deviceGroup) as {
      assetsUrl?: string;
      _links: Record<string, { procedure: string }>;
    };

    expect(result.assetsUrl).toBeUndefined();
    expect(result._links.assets.procedure).toBe("assets.getManyByDeviceGroup");
  });
});
