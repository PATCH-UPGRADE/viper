// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const findUnique = vi.hoisted(() => vi.fn());
vi.mock("@/lib/db", () => ({
  default: { vulnerabilityRecord: { findUnique } },
}));

import { requireRecordOwnership } from "../middleware";

beforeEach(() => vi.clearAllMocks());

describe("requireRecordOwnership", () => {
  it("lets the owner change their record", async () => {
    findUnique.mockResolvedValue({ userId: "user-1" });
    await expect(
      requireRecordOwnership("rec-1", "user-1"),
    ).resolves.toBeTruthy();
  });

  it("forbids anyone else", async () => {
    findUnique.mockResolvedValue({ userId: "user-1" });
    await expect(
      requireRecordOwnership("rec-1", "user-2"),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("lets anyone change a record with no owner", async () => {
    findUnique.mockResolvedValue({ userId: null });
    await expect(
      requireRecordOwnership("rec-1", "user-2"),
    ).resolves.toBeTruthy();
  });

  it("is NOT_FOUND for a missing record", async () => {
    findUnique.mockResolvedValue(null);
    await expect(
      requireRecordOwnership("missing", "user-1"),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
