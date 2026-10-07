// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ default: {} }));
vi.mock("@/lib/auth-utils", () => ({
  getSession: vi.fn(),
  verifyApiKey: vi.fn(),
}));

const { assetOrderBy } = await import("../routers");

describe("assetOrderBy", () => {
  it("sorts the device type column by the product's device type", () => {
    expect(assetOrderBy("deviceType")).toEqual([
      { deviceGroup: { product: { deviceType: { displayName: "asc" } } } },
      { updatedAt: "desc" },
    ]);
    expect(assetOrderBy("-deviceType")[0]).toEqual({
      deviceGroup: { product: { deviceType: { displayName: "desc" } } },
    });
  });

  it("sorts issues by count, other columns by their field, then by update time", () => {
    expect(assetOrderBy("-issues,ip")).toEqual([
      { issues: { _count: "desc" } },
      { ip: "asc" },
      { updatedAt: "desc" },
    ]);
  });

  it("sorts by update time only, with no sort", () => {
    expect(assetOrderBy(undefined)).toEqual([{ updatedAt: "desc" }]);
    expect(assetOrderBy("")).toEqual([{ updatedAt: "desc" }]);
  });
});
