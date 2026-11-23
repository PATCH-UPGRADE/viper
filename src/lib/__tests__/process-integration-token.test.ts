// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { mockPrisma, mockConsume } = vi.hoisted(() => ({
  mockPrisma: { integration: { findUnique: vi.fn() } },
  mockConsume: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ default: mockPrisma }));
vi.mock("../tokens", () => ({ consumeIntegrationToken: mockConsume }));

import { ResourceType } from "@/generated/prisma";
import { processIntegrationToken } from "../router-utils";

beforeEach(() => vi.resetAllMocks());

describe("processIntegrationToken", () => {
  it("returns the integration and its shadow user", async () => {
    mockConsume.mockResolvedValue("integration-1");
    mockPrisma.integration.findUnique.mockResolvedValue({
      integrationUserId: "shadow-user",
    });

    await expect(
      processIntegrationToken("raw", ResourceType.Asset),
    ).resolves.toEqual({
      userId: "shadow-user",
      integrationId: "integration-1",
      resource: ResourceType.Asset,
    });
    expect(mockConsume).toHaveBeenCalledWith("raw", ResourceType.Asset);
    expect(mockPrisma.integration.findUnique).toHaveBeenCalledWith({
      where: { id: "integration-1" },
      select: { integrationUserId: true },
    });
  });

  it("refuses an invalid token", async () => {
    mockConsume.mockResolvedValue(null);

    await expect(
      processIntegrationToken("raw", ResourceType.Asset),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mockPrisma.integration.findUnique).not.toHaveBeenCalled();
  });
});
