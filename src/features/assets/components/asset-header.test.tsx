import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const { mockUseSuspenseAsset } = vi.hoisted(() => ({
  mockUseSuspenseAsset: vi.fn(() => ({
    data: {
      id: "rad-ct-002",
      role: "CT Scanner" as string | null,
      updatedAt: new Date("2026-07-30T12:00:00Z"),
    },
  })),
}));

vi.mock("../hooks/use-assets", () => ({
  useSuspenseAsset: mockUseSuspenseAsset,
}));

import { AssetHeader } from "./asset";

describe("AssetHeader", () => {
  it("renders the breadcrumb, asset title, and Hospital Asset badge", () => {
    render(<AssetHeader assetId="rad-ct-002" />);

    expect(screen.getByText("All Assets")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "CT Scanner" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Hospital Asset")).toBeInTheDocument();
    expect(screen.getByText(/updated .* ago/i)).toBeInTheDocument();
  });

  it("falls back to the unknown-role label when the asset has no role", () => {
    mockUseSuspenseAsset.mockReturnValueOnce({
      data: {
        id: "rad-ct-002",
        role: null,
        updatedAt: new Date("2026-07-30T12:00:00Z"),
      },
    });

    render(<AssetHeader assetId="rad-ct-002" />);

    // Appears twice: once in the breadcrumb, once as the h1.
    expect(screen.getAllByText(/unknown/i).length).toBeGreaterThan(0);
  });
});
