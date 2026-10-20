// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { mockCaptureException, mockFindMany, mockRegistry } = vi.hoisted(() => ({
  mockCaptureException: vi.fn(),
  mockFindMany: vi.fn(),
  mockRegistry: {} as Record<string, unknown>,
}));

vi.mock("@sentry/nextjs", () => ({ captureException: mockCaptureException }));
vi.mock("@/lib/db", () => ({
  default: { integration: { findMany: mockFindMany } },
}));
vi.mock("../registry", () => ({
  registeredModules: () => Object.values(mockRegistry),
}));

import { PlatformEnum } from "@/generated/prisma";
import { suggestedPlatforms } from "../suggestions";

const moduleFor = (platform: PlatformEnum, suggest?: unknown) => ({
  definition: { platform },
  suggest,
});

beforeEach(() => {
  vi.clearAllMocks();
  for (const key of Object.keys(mockRegistry)) delete mockRegistry[key];
});

describe("suggestedPlatforms", () => {
  it("gives every hook the same integration rows and keeps registry order", async () => {
    const integrations = [{ platform: PlatformEnum.CSAF, enabled: true }];
    mockFindMany.mockResolvedValue(integrations);
    const fleetSuggest = vi.fn().mockResolvedValue({ reason: "fleet" });
    const medisaoSuggest = vi.fn().mockResolvedValue({ reason: "medisao" });
    Object.assign(mockRegistry, {
      FLEET: moduleFor(PlatformEnum.FLEET, fleetSuggest),
      PARTNER: moduleFor(PlatformEnum.PARTNER),
      MEDISAO: moduleFor(PlatformEnum.MEDISAO, medisaoSuggest),
    });

    await expect(suggestedPlatforms()).resolves.toEqual([
      { platform: PlatformEnum.FLEET, reason: "fleet" },
      { platform: PlatformEnum.MEDISAO, reason: "medisao" },
    ]);
    expect(mockFindMany).toHaveBeenCalledTimes(1);
    expect(fleetSuggest).toHaveBeenCalledWith({ integrations });
    expect(medisaoSuggest).toHaveBeenCalledWith({ integrations });
  });

  it("leaves out a platform whose hook returns null", async () => {
    mockFindMany.mockResolvedValue([]);
    Object.assign(mockRegistry, {
      FLEET: moduleFor(PlatformEnum.FLEET, vi.fn().mockResolvedValue(null)),
    });

    await expect(suggestedPlatforms()).resolves.toEqual([]);
  });

  it("reports a hook that throws and keeps the other suggestions", async () => {
    mockFindMany.mockResolvedValue([]);
    const error = new Error("boom");
    Object.assign(mockRegistry, {
      FLEET: moduleFor(PlatformEnum.FLEET, vi.fn().mockRejectedValue(error)),
      MEDISAO: moduleFor(
        PlatformEnum.MEDISAO,
        vi.fn().mockResolvedValue({ reason: "medisao" }),
      ),
    });

    await expect(suggestedPlatforms()).resolves.toEqual([
      { platform: PlatformEnum.MEDISAO, reason: "medisao" },
    ]);
    expect(mockCaptureException).toHaveBeenCalledWith(error, {
      tags: { platform: PlatformEnum.FLEET },
    });
  });
});
