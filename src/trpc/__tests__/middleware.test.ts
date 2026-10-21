// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const findUnique = vi.hoisted(() => vi.fn());
vi.mock("@/lib/db", () => ({
  default: { vulnerabilityRecord: { findUnique } },
}));

import { requireOwnership } from "../middleware";

beforeEach(() => vi.clearAllMocks());

describe("requireOwnership", () => {
  const check = (userId: string, options?: { allowUnowned?: boolean }) =>
    requireOwnership("rec-1", userId, "vulnerabilityRecord", options);

  it("lets the owner modify their resource", async () => {
    findUnique.mockResolvedValue({ userId: "user-1" });
    await expect(check("user-1")).resolves.toBeTruthy();
  });

  it("forbids anyone else", async () => {
    findUnique.mockResolvedValue({ userId: "user-1" });
    await expect(check("user-2", { allowUnowned: true })).rejects.toMatchObject(
      { code: "FORBIDDEN" },
    );
  });

  it("lets anyone modify an unowned resource when allowUnowned is set", async () => {
    findUnique.mockResolvedValue({ userId: null });
    await expect(check("user-2", { allowUnowned: true })).resolves.toBeTruthy();
  });

  it("forbids an unowned resource by default", async () => {
    findUnique.mockResolvedValue({ userId: null });
    await expect(check("user-2")).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("is NOT_FOUND for a missing resource", async () => {
    findUnique.mockResolvedValue(null);
    await expect(check("user-1")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
