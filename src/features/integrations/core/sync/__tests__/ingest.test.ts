// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { mockPrisma, mockCreateArtifactWrappers } = vi.hoisted(() => ({
  mockPrisma: {
    $transaction: vi.fn(),
    integrationResourceSync: { upsert: vi.fn() },
    apiKeyConnector: { updateMany: vi.fn() },
  },
  mockCreateArtifactWrappers: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ default: mockPrisma }));
vi.mock("@/lib/router-utils", () => ({
  createArtifactWrappers: mockCreateArtifactWrappers,
}));

import { ResourceType } from "@/generated/prisma";
import { PrismaClientValidationError } from "@/generated/prisma/runtime/library";
import { type ArtifactsContent, processIntegrationSync } from "../ingest";

/**
 * If we get a Prisma error on an integration, errors are
 * collected, the batch continues, and the response reports real partial counts.
 */

type Item = {
  vendorId: string;
  hostname?: string;
  upstreamApi?: string | null;
  webUrl?: string | null;
};

// The real delegates are Prisma models; these stand in for whichever pair the
// caller wired up (asset/externalAssetMapping, workOrderTicket/..., etc).
// biome-ignore lint/suspicious/noExplicitAny: mirrors the helper's own delegate typing
type Delegate = ReturnType<typeof vi.fn<(args: any) => Promise<any>>>;

const delegate = (
  // biome-ignore lint/suspicious/noExplicitAny: a stubbed prisma row
  impl: (args: any) => Promise<any>,
): Delegate => vi.fn(impl);

const makeConfig = (overrides: Record<string, unknown> = {}) => ({
  model: {
    findFirst: delegate(async () => null),
    create: delegate(async () => ({ id: `item-${crypto.randomUUID()}` })),
    update: delegate(async () => ({ id: "item-1" })),
  },
  mappingModel: {
    findFirst: delegate(async () => null),
    create: delegate(async () => ({ id: "map-1", itemId: "item-1" })),
    update: delegate(async () => ({ id: "map-1", itemId: "item-1" })),
  },
  transformInputItem: vi.fn(
    async (
      item: Item,
    ): Promise<{
      createData: Record<string, unknown>;
      updateData: Record<string, unknown>;
      uniqueFieldConditions: Array<Record<string, unknown>>;
      artifactsData: ArtifactsContent | undefined;
    }> => ({
      createData: { hostname: item.hostname },
      updateData: { hostname: item.hostname },
      uniqueFieldConditions: [],
      artifactsData: undefined,
    }),
  ),
  ...overrides,
});

// biome-ignore lint/suspicious/noExplicitAny: the helper is generic over prisma delegates
const run = (config: any, items: Item[]) =>
  processIntegrationSync(
    // biome-ignore lint/suspicious/noExplicitAny: test stub for the prisma client
    mockPrisma as any,
    config,
    { items },
    "user-1",
    "integration-1",
    ResourceType.Asset,
  );

const items = (n: number): Item[] =>
  Array.from({ length: n }, (_, i) => ({
    vendorId: `v${i + 1}`,
    hostname: `host-${i + 1}`,
  }));

beforeEach(() => {
  vi.clearAllMocks();
  // Default: transactions and the status upsert just succeed.
  mockPrisma.$transaction.mockImplementation(
    // biome-ignore lint/suspicious/noExplicitAny: mirrors prisma's dual signature
    async (arg: any) =>
      typeof arg === "function" ? arg(mockPrisma) : Promise.all(arg),
  );
});

describe("processIntegrationSync — the three branches", () => {
  it("updates the item when a mapping already exists", async () => {
    const config = makeConfig();
    config.mappingModel.findFirst.mockResolvedValue({
      id: "map-1",
      itemId: "item-9",
    });

    const response = await run(config, items(1));

    expect(response.updatedItemsCount).toBe(1);
    expect(response.createdItemsCount).toBe(0);
    expect(config.model.create).not.toHaveBeenCalled();
    expect(config.model.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "item-9" } }),
    );
  });

  it("creates the item and its mapping when neither exists", async () => {
    const config = makeConfig();

    const response = await run(config, items(1));

    expect(response.createdItemsCount).toBe(1);
    expect(config.model.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        externalMappings: {
          create: expect.objectContaining({
            integrationId: "integration-1",
            externalId: "v1",
          }),
        },
      }),
    });
  });

  it("creates only the mapping when the item already exists", async () => {
    const config = makeConfig();
    config.transformInputItem.mockResolvedValue({
      createData: {},
      updateData: { hostname: "host-1" },
      uniqueFieldConditions: [{ hostname: "host-1" }],
      artifactsData: undefined,
    });
    config.model.findFirst.mockResolvedValue({ id: "item-existing" });

    const response = await run(config, items(1));

    expect(response.updatedItemsCount).toBe(1);
    expect(config.model.create).not.toHaveBeenCalled();
    expect(config.mappingModel.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        itemId: "item-existing",
        externalId: "v1",
      }),
    });
  });
});

describe("processIntegrationSync — partial failures", () => {
  it("keeps going after a failing item and reports real counts", async () => {
    const config = makeConfig();
    config.model.create.mockImplementation(async ({ data }) => {
      if (data.hostname === "host-2") throw new Error("boom");
      return { id: `item-${data.hostname}` };
    });

    const response = await run(config, items(5));

    expect(response.createdItemsCount).toBe(4);
    expect(response.shouldRetry).toBe(true);
    expect(config.model.create).toHaveBeenCalledTimes(5);
  });

  it("names the scale of the failure in `message`", async () => {
    const config = makeConfig();
    config.model.create.mockImplementation(async ({ data }) => {
      if (data.hostname === "host-2") throw new Error("boom");
      return { id: "x" };
    });

    const response = await run(config, items(5));

    expect(response.message).toBe("1 of 5 items failed: Internal Server Error");
  });

  it("collapses identical failures into one clause", async () => {
    const config = makeConfig();
    config.model.create.mockRejectedValue(new Error("same every time"));

    const response = await run(config, items(4));

    expect(response.message).toBe("4 of 4 items failed: Internal Server Error");
    expect(response.message).not.toContain("more");
  });

  it("caps the summary at three distinct clauses", async () => {
    const config = makeConfig();
    let n = 0;
    config.model.create.mockImplementation(async () => {
      n += 1;
      // Only Prisma errors keep their own message; anything else is flattened
      // to "Internal Server Error", which would collapse to a single clause.
      throw new PrismaClientValidationError(`failure ${n}`, {
        clientVersion: "test",
      });
    });

    const response = await run(config, items(5));

    expect(response.message).toBe(
      "5 of 5 items failed: failure 1; failure 2; failure 3 (+2 more)",
    );
  });

  it("bounds the summary so it fits the errorMessage column", async () => {
    const config = makeConfig();
    config.model.create.mockImplementation(async () => {
      throw new PrismaClientValidationError("x".repeat(2000), {
        clientVersion: "test",
      });
    });

    const response = await run(config, items(1));

    expect(response.message.length).toBe(1000);
  });

  it("reports plain success when nothing failed", async () => {
    const response = await run(makeConfig(), items(3));

    expect(response.message).toBe("success");
    expect(response.shouldRetry).toBe(false);
    expect(response.createdItemsCount).toBe(3);
  });

  it("closes out the sync row even for an empty batch", async () => {
    const response = await run(makeConfig(), []);

    expect(response.message).toBe("success");
    expect(mockPrisma.integrationResourceSync.upsert).toHaveBeenCalledTimes(1);
  });
});

describe("processIntegrationSync — mapping URLs", () => {
  it("writes upstreamApi and webUrl onto the mapping, not the record", async () => {
    const config = makeConfig();

    await run(config, [
      {
        vendorId: "v1",
        hostname: "h",
        upstreamApi: "https://api.example.com/1",
        webUrl: "https://example.com/1",
      },
    ]);

    const created = config.model.create.mock.calls[0][0].data;
    expect(created.externalMappings.create).toMatchObject({
      upstreamApi: "https://api.example.com/1",
      webUrl: "https://example.com/1",
    });
    expect(created).not.toHaveProperty("upstreamApi");
  });

  it("writes null, not undefined, when the item omits them", async () => {
    const config = makeConfig();
    config.mappingModel.findFirst.mockResolvedValue({
      id: "map-1",
      itemId: "item-1",
    });

    await run(config, [{ vendorId: "v1", hostname: "h" }]);

    // undefined would mean "leave the column alone", so a platform that
    // removed a URL could never clear it.
    expect(config.mappingModel.update.mock.calls[0][0].data).toMatchObject({
      upstreamApi: null,
      webUrl: null,
    });
  });
});

describe("processIntegrationSync — hooks", () => {
  it("fires onItemCreated only for newly created items", async () => {
    const onItemCreated = vi.fn(async () => {});
    const config = makeConfig({ onItemCreated });
    config.mappingModel.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "map-1", itemId: "item-1" });

    await run(config, items(2));

    expect(onItemCreated).toHaveBeenCalledTimes(1);
  });

  it("does not fail the sync when onItemCreated throws", async () => {
    const config = makeConfig({
      onItemCreated: vi.fn().mockRejectedValue(new Error("hook exploded")),
    });

    const response = await run(config, items(1));

    expect(response.shouldRetry).toBe(false);
    expect(response.createdItemsCount).toBe(1);
  });

  it("creates artifact wrappers for the created item", async () => {
    const config = makeConfig();
    config.model.create.mockResolvedValue({ id: "item-42" });
    config.transformInputItem.mockResolvedValue({
      createData: {},
      updateData: {},
      uniqueFieldConditions: [],
      artifactsData: {
        artifacts: [{ artifactType: "Source" }],
        artifactWrapperParentField: "remediationId",
      },
    });

    await run(config, items(1));

    expect(mockCreateArtifactWrappers).toHaveBeenCalledWith(
      expect.anything(),
      [{ artifactType: "Source" }],
      "item-42",
      "remediationId",
      "user-1",
    );
  });
});
