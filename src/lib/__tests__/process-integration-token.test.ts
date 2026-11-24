// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { mockPrisma, mockConsume } = vi.hoisted(() => ({
  mockPrisma: { integration: { findUnique: vi.fn() } },
  mockConsume: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ default: mockPrisma }));
vi.mock("../tokens", () => ({ consumeIntegrationToken: mockConsume }));

import { ResourceType } from "@/generated/prisma";
import { processIntegrationToken } from "../router-utils";

describe("processIntegrationToken", () => {
  it("refuses an invalid token", async () => {
    mockConsume.mockResolvedValue(null);

    await expect(
      processIntegrationToken("raw", ResourceType.Asset),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mockPrisma.integration.findUnique).not.toHaveBeenCalled();
  });
});
