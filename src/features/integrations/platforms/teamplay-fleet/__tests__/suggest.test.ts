// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockAssetCount } = vi.hoisted(() => ({ mockAssetCount: vi.fn() }));

vi.mock("@/lib/db", () => ({
  default: { asset: { count: mockAssetCount } },
}));

import { PlatformEnum } from "@/generated/prisma";
import { suggest } from "../suggest";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("teamplay Fleet suggest", () => {
  it("returns null when a Fleet integration exists, even a disabled one", async () => {
    const result = await suggest({
      integrations: [{ platform: PlatformEnum.FLEET, enabled: false }],
    });

    expect(result).toBeNull();
    expect(mockAssetCount).not.toHaveBeenCalled();
  });

  it("returns null when no asset is from Siemens Healthineers", async () => {
    mockAssetCount.mockResolvedValue(0);

    await expect(suggest({ integrations: [] })).resolves.toBeNull();
  });

  it("counts Siemens Healthineers assets by the canonical manufacturer name", async () => {
    mockAssetCount.mockResolvedValue(12);

    const result = await suggest({
      integrations: [{ platform: PlatformEnum.MEDISAO, enabled: true }],
    });

    expect(result?.reason).toBe(
      "We found 12 Siemens Healthineers assets on your network, which are handled in teamplay Fleet.",
    );
    expect(mockAssetCount).toHaveBeenCalledWith({
      where: {
        manufacturer: { is: { canonicalName: "siemens healthineers" } },
      },
    });
  });

  it("uses the singular for one asset", async () => {
    mockAssetCount.mockResolvedValue(1);

    const result = await suggest({ integrations: [] });

    expect(result?.reason).toContain("1 Siemens Healthineers asset on");
  });
});
