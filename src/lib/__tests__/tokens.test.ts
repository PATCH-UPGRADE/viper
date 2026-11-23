// @vitest-environment node
import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { mockToken } = vi.hoisted(() => ({
  mockToken: {
    create: vi.fn(),
    findUnique: vi.fn(),
    delete: vi.fn(),
    deleteMany: vi.fn(),
  },
}));
vi.mock("@/lib/db", () => ({ default: { integrationToken: mockToken } }));

import { ResourceType } from "@/generated/prisma";
import {
  consumeIntegrationToken,
  createIntegrationToken,
  DEFAULT_TOKEN_TTL_SECONDS,
  purgeExpiredTokens,
} from "../tokens";

const NOW = new Date("2026-11-23T12:00:00Z");
const sha256 = (raw: string) => createHash("sha256").update(raw).digest("hex");

const storedToken = (overrides = {}) => ({
  id: "token-1",
  integrationId: "integration-1",
  tokenHash: sha256("raw"),
  resource: ResourceType.Asset,
  expiresAt: new Date(NOW.getTime() + 1000),
  ...overrides,
});

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers({ now: NOW });
  mockToken.delete.mockResolvedValue({});
  mockToken.deleteMany.mockResolvedValue({ count: 1 });
  return () => vi.useRealTimers();
});

describe("createIntegrationToken", () => {
  it("stores only the hash, scoped to the integration and resource", async () => {
    const raw = await createIntegrationToken(
      "integration-1",
      ResourceType.Asset,
    );

    expect(raw).toMatch(/^[0-9a-f]{64}$/);
    expect(mockToken.create).toHaveBeenCalledWith({
      data: {
        integrationId: "integration-1",
        tokenHash: sha256(raw),
        resource: ResourceType.Asset,
        expiresAt: new Date(NOW.getTime() + DEFAULT_TOKEN_TTL_SECONDS * 1000),
      },
    });
  });

  it("uses a given lifetime", async () => {
    await createIntegrationToken("integration-1", ResourceType.Asset, 60);

    expect(mockToken.create.mock.calls[0][0].data.expiresAt).toEqual(
      new Date(NOW.getTime() + 60_000),
    );
  });
});

describe("consumeIntegrationToken", () => {
  const consume = () => consumeIntegrationToken("raw", ResourceType.Asset);

  it("returns the integration and spends the token", async () => {
    mockToken.findUnique.mockResolvedValue(storedToken());

    await expect(consume()).resolves.toBe("integration-1");
    expect(mockToken.deleteMany).toHaveBeenCalledWith({
      where: { tokenHash: sha256("raw") },
    });
  });

  it("refuses an unknown token", async () => {
    mockToken.findUnique.mockResolvedValue(null);

    await expect(consume()).resolves.toBeNull();
  });

  it("refuses and removes an expired token", async () => {
    mockToken.findUnique.mockResolvedValue(
      storedToken({ expiresAt: new Date(NOW.getTime() - 1) }),
    );

    await expect(consume()).resolves.toBeNull();
    expect(mockToken.delete).toHaveBeenCalledWith({
      where: { tokenHash: sha256("raw") },
    });
  });

  it("refuses a token for another resource without spending it", async () => {
    mockToken.findUnique.mockResolvedValue(
      storedToken({ resource: ResourceType.WorkOrder }),
    );

    await expect(consume()).resolves.toBeNull();
    expect(mockToken.delete).not.toHaveBeenCalled();
    expect(mockToken.deleteMany).not.toHaveBeenCalled();
  });

  it("refuses a token that another request spent first", async () => {
    mockToken.findUnique.mockResolvedValue(storedToken());
    mockToken.deleteMany.mockResolvedValue({ count: 0 });

    await expect(consume()).resolves.toBeNull();
  });
});

describe("purgeExpiredTokens", () => {
  it("deletes only expired tokens and returns how many", async () => {
    mockToken.deleteMany.mockResolvedValue({ count: 3 });

    await expect(purgeExpiredTokens()).resolves.toBe(3);
    expect(mockToken.deleteMany).toHaveBeenCalledWith({
      where: { expiresAt: { lt: NOW } },
    });
  });
});
