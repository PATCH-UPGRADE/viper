// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { mockPrisma, mockUpdate, fakeRegistry } = vi.hoisted(() => {
  const mockUpdate = vi.fn();
  const connector = {
    definition: {
      configSchema: { parse: (c: unknown) => c },
      credentialSchema: { parse: (c: unknown) => c },
    },
    createSession: () => ({ request: vi.fn() }),
    workOrders: {
      update: mockUpdate,
      pushedFields: ["summary", "description", "scheduledAt"],
      lockedFields: ["status"],
    },
  };
  return {
    mockPrisma: { externalWorkOrderMapping: { findMany: vi.fn() } },
    mockUpdate,
    fakeRegistry: {
      SERVICENOW: connector,
      // A platform with a work order module that takes no edits.
      TEAMPLAY_FLEET: { ...connector, workOrders: {} },
    } as Record<string, unknown>,
  };
});

vi.mock("@/lib/db", () => ({ default: mockPrisma }));
vi.mock("@/features/integrations/core/registry", () => ({
  registry: fakeRegistry,
}));
const mockLoadContext = vi.hoisted(() => vi.fn());
vi.mock("@/features/integrations/core/context", () => ({
  loadIntegrationContext: mockLoadContext,
}));

import { lockedFieldsFor, patchFor, pushEditToPlatforms } from "../push-edit";

const current = {
  summary: "Old title",
  body: "Old body",
  status: "IN_PROGRESS" as const,
  category: "PATCH" as const,
  priority: "High" as const,
  scheduledAt: new Date("2026-11-02T14:00:00Z"),
  scheduledEndTime: new Date("2026-11-02T16:00:00Z"),
};

const mapping = (platform: string, overrides = {}) => ({
  externalId: "sys-1",
  integration: {
    id: `int-${platform}`,
    name: platform === "SERVICENOW" ? "ServiceNow" : "Fleet",
    platform,
    enabled: true,
    ...overrides,
  },
});

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.externalWorkOrderMapping.findMany.mockResolvedValue([
    mapping("SERVICENOW"),
  ]);
  mockLoadContext.mockImplementation(async (integrationId: string) => ({
    module: fakeRegistry[integrationId.replace("int-", "")],
    config: { instanceUrl: "https://dev.service-now.com" },
    creds: { username: "u", password: "p" },
  }));
  mockUpdate.mockResolvedValue({ externalId: "sys-1", raw: {} });
});

describe("patchFor", () => {
  it("leaves out the fields that did not change", () => {
    expect(patchFor(current, { ...current })).toEqual({});
  });

  it("maps the body onto the description, and the times onto ISO strings", () => {
    expect(
      patchFor(current, {
        summary: "New title",
        body: "New body",
        status: "DONE",
        category: "CONFIG_CHANGE",
        priority: "Critical",
        scheduledAt: new Date("2026-11-03T14:00:00Z"),
        scheduledEndTime: null,
      }),
    ).toEqual({
      summary: "New title",
      description: "New body",
      status: "DONE",
      category: "CONFIG_CHANGE",
      priority: "Critical",
      scheduledAt: "2026-11-03T14:00:00.000Z",
      scheduledEndTime: null,
    });
  });

  it("treats a cleared body and an empty body as the same", () => {
    expect(patchFor({ ...current, body: "" }, { body: null })).toEqual({});
    expect(patchFor(current, { body: null })).toEqual({ description: "" });
  });
});

describe("lockedFieldsFor", () => {
  it("names the integration that owns each locked field", () => {
    expect(lockedFieldsFor([mapping("SERVICENOW")] as never)).toEqual([
      { field: "status", managedBy: "ServiceNow" },
    ]);
  });

  it("returns nothing for a ticket with no mappings", () => {
    expect(lockedFieldsFor([])).toEqual([]);
  });
});

describe("pushEditToPlatforms", () => {
  it("sends only the changed fields to the platform", async () => {
    await pushEditToPlatforms("t1", current, {
      ...current,
      summary: "New title",
    });

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.anything(),
      "sys-1",
      { summary: "New title" },
      { instanceUrl: "https://dev.service-now.com" },
    );
  });

  it("does nothing for a ticket that no platform holds", async () => {
    mockPrisma.externalWorkOrderMapping.findMany.mockResolvedValue([]);

    await pushEditToPlatforms("t1", current, { summary: "New title" });

    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("calls the platform only when a pushable field changed", async () => {
    await pushEditToPlatforms("t1", current, { ...current });

    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("sends only the fields that the platform pushes", async () => {
    await pushEditToPlatforms("t1", current, {
      summary: "New title",
      priority: "Critical",
      scheduledEndTime: null,
    });

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.anything(),
      "sys-1",
      { summary: "New title" },
      expect.anything(),
    );
  });

  it("skips the platform when no changed field is one it pushes", async () => {
    await pushEditToPlatforms("t1", current, { priority: "Critical" });

    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("names the locked field in the refusal", async () => {
    const original = fakeRegistry.SERVICENOW;
    fakeRegistry.SERVICENOW = {
      ...(original as object),
      workOrders: {
        update: mockUpdate,
        pushedFields: ["summary"],
        lockedFields: ["scheduledAt"],
      },
    };
    try {
      await expect(
        pushEditToPlatforms("t1", current, { scheduledAt: null }),
      ).rejects.toMatchObject({
        code: "BAD_REQUEST",
        message: expect.stringContaining(
          "The start time of this work order is managed in ServiceNow",
        ),
      });
      expect(mockUpdate).not.toHaveBeenCalled();
    } finally {
      fakeRegistry.SERVICENOW = original;
    }
  });

  it("refuses a status change that the platform owns", async () => {
    await expect(
      pushEditToPlatforms("t1", current, { status: "DONE" }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: expect.stringContaining("managed in ServiceNow"),
    });
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("accepts a locked field that the edit leaves unchanged", async () => {
    await pushEditToPlatforms("t1", current, {
      status: "IN_PROGRESS",
      summary: "New title",
    });

    expect(mockUpdate).toHaveBeenCalledTimes(1);
  });

  it("skips a platform that takes no edits", async () => {
    mockPrisma.externalWorkOrderMapping.findMany.mockResolvedValue([
      mapping("TEAMPLAY_FLEET"),
    ]);

    await pushEditToPlatforms("t1", current, { summary: "New title" });

    expect(mockUpdate).not.toHaveBeenCalled();
  });

  describe("on a disabled integration", () => {
    beforeEach(() => {
      mockPrisma.externalWorkOrderMapping.findMany.mockResolvedValue([
        mapping("SERVICENOW", { enabled: false }),
      ]);
    });

    it("refuses a change to a field that the integration pushes", async () => {
      await expect(
        pushEditToPlatforms("t1", current, { summary: "New title" }),
      ).rejects.toMatchObject({
        code: "BAD_REQUEST",
        message: expect.stringContaining("ServiceNow is disabled"),
      });
      expect(mockUpdate).not.toHaveBeenCalled();
    });

    it("accepts a change to a field that stays in VIPER", async () => {
      await pushEditToPlatforms("t1", current, { priority: "Critical" });

      expect(mockUpdate).not.toHaveBeenCalled();
    });

    it("keeps its locks", async () => {
      await expect(
        pushEditToPlatforms("t1", current, { status: "DONE" }),
      ).rejects.toMatchObject({
        code: "BAD_REQUEST",
        message: expect.stringContaining("managed in ServiceNow"),
      });
    });

    it("refuses before any other platform gets the edit", async () => {
      mockPrisma.externalWorkOrderMapping.findMany.mockResolvedValue([
        mapping("SERVICENOW"),
        {
          ...mapping("SERVICENOW", { enabled: false }),
          externalId: "sys-2",
        },
      ]);

      await expect(
        pushEditToPlatforms("t1", current, { summary: "New title" }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
      expect(mockUpdate).not.toHaveBeenCalled();
    });
  });

  it("names the platform and the reason when the platform refuses", async () => {
    mockUpdate.mockRejectedValue(
      new Error("ServiceNow refused the request (403)"),
    );

    await expect(
      pushEditToPlatforms("t1", current, { summary: "New title" }),
    ).rejects.toMatchObject({
      code: "BAD_GATEWAY",
      message: expect.stringMatching(
        /ServiceNow did not accept.*saved nothing.*403/,
      ),
    });
  });

  it("reports an integration whose settings cannot be loaded", async () => {
    mockLoadContext.mockRejectedValue(new Error("Invalid credentials"));

    await expect(
      pushEditToPlatforms("t1", current, { summary: "New title" }),
    ).rejects.toMatchObject({
      code: "BAD_GATEWAY",
      message: expect.stringMatching(
        /ServiceNow did not accept.*Invalid credentials/,
      ),
    });
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});
