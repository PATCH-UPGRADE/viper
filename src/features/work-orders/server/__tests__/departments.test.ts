// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    department: { findMany: vi.fn() },
  },
}));

vi.mock("@/lib/db", () => ({ default: mockPrisma }));

import { resolveResponsibleDepartments } from "../departments";

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.department.findMany.mockResolvedValue([]);
});

describe("resolveResponsibleDepartments", () => {
  it("does not query for an empty asset set", async () => {
    await expect(resolveResponsibleDepartments([])).resolves.toEqual([]);
    expect(mockPrisma.department.findMany).not.toHaveBeenCalled();
  });

  it("returns the id of each department found", async () => {
    mockPrisma.department.findMany.mockResolvedValue([
      { id: "dept-it" },
      { id: "dept-biomed" },
    ]);

    await expect(resolveResponsibleDepartments(["a1", "a2"])).resolves.toEqual([
      "dept-it",
      "dept-biomed",
    ]);
  });

  // An in-house department rarely has a platform to file on, so filtering on
  // the integration would drop exactly the owners this lookup is for.
  it("reads department relationships whether or not they name an integration", async () => {
    await resolveResponsibleDepartments(["a1"]);

    const [args] = mockPrisma.department.findMany.mock.calls[0];
    expect(args.where).toEqual({
      managesRelationships: {
        some: { assets: { some: { id: { in: ["a1"] } } } },
      },
    });
  });
});
