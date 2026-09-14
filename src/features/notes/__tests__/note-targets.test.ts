// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: { asset: { findUnique: vi.fn() } },
}));
vi.mock("@/lib/db", () => ({ default: mockPrisma }));

import { resolveNoteTargetLabel } from "@/features/notes/server/note-targets";

describe("resolveNoteTargetLabel for an ASSET", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("labels a Fleet asset by serial number instead of reporting it missing", async () => {
    mockPrisma.asset.findUnique.mockResolvedValue({
      id: "ct_63014",
      hostname: null,
      ip: null,
      serialNumber: "63014",
      role: "Computed Tomography (CT)",
    });

    await expect(resolveNoteTargetLabel("ASSET", "ct_63014")).resolves.toBe(
      "63014",
    );
  });

  it("returns null only when the asset row does not exist", async () => {
    mockPrisma.asset.findUnique.mockResolvedValue(null);

    await expect(
      resolveNoteTargetLabel("ASSET", "missing"),
    ).resolves.toBeNull();
  });
});
