// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: { vulnerability: { findMany: vi.fn() } },
}));
vi.mock("@/lib/db", () => ({ default: mockPrisma }));

import { heldVulnerabilities } from "../sync";

describe("heldVulnerabilities", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.vulnerability.findMany.mockResolvedValue([{ id: "v-1" }]);
  });

  it("finds vulnerabilities by their normalized CVE identifiers", async () => {
    await expect(
      heldVulnerabilities([
        " cve-2024-1234 ",
        "CVE-2024-1234",
        "CVE-2023-9999",
      ]),
    ).resolves.toEqual([{ id: "v-1" }]);

    expect(mockPrisma.vulnerability.findMany).toHaveBeenCalledWith({
      where: {
        identifiers: {
          some: { value: { in: ["CVE-2024-1234", "CVE-2023-9999"] } },
        },
      },
      select: { id: true },
    });
  });

  it("does not query when the update names no CVEs", async () => {
    await expect(heldVulnerabilities([])).resolves.toEqual([]);
    expect(mockPrisma.vulnerability.findMany).not.toHaveBeenCalled();
  });
});
