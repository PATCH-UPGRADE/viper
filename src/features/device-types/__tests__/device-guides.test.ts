import { describe, expect, it } from "vitest";
import {
  describeProducts,
  type PageProduct,
  toProductGuides,
} from "../device-guides";
import type { DeviceGuides } from "../server/routers";

const product = (
  productId: string,
  deviceTypeId: string | null,
): PageProduct => ({
  productId,
  product: `Product ${productId}`,
  deviceTypeId,
});

const guides: DeviceGuides = {
  deviceTypes: [
    { id: "dt-mri", displayName: "MRI", generalText: "Detailed pictures." },
    { id: "dt-ct", displayName: "CT", generalText: "Quick pictures." },
    { id: "dt-fw", displayName: "Firewall", generalText: null },
  ],
  productGuides: [{ productId: "gotop", body: "Main CT for the ED." }],
};

describe("toProductGuides", () => {
  it("returns one entry per product, in the page's order, with its type's text", () => {
    const result = toProductGuides(
      [product("sola", "dt-mri"), product("gotop", "dt-ct")],
      guides,
    );

    expect(result).toEqual([
      {
        productId: "sola",
        product: "Product sola",
        deviceType: "MRI",
        generalText: "Detailed pictures.",
        productText: null,
      },
      {
        productId: "gotop",
        product: "Product gotop",
        deviceType: "CT",
        generalText: "Quick pictures.",
        productText: "Main CT for the ED.",
      },
    ]);
  });

  it("gives two products of the same type the same general text", () => {
    const [a, b] = toProductGuides(
      [product("gotop", "dt-ct"), product("x-cite", "dt-ct")],
      guides,
    );

    expect(a.generalText).toBe("Quick pictures.");
    expect(b.generalText).toBe("Quick pictures.");
    expect(a.productText).toBe("Main CT for the ED.");
    expect(b.productText).toBeNull();
  });

  it("returns null type and text for a product with no device type", () => {
    const [entry] = toProductGuides([product("optiplex", null)], guides);

    expect(entry.deviceType).toBeNull();
    expect(entry.generalText).toBeNull();
  });

  it("keeps the type name but no text for a type without a guide", () => {
    const [entry] = toProductGuides([product("asa", "dt-fw")], guides);
    expect(entry.deviceType).toBe("Firewall");
    expect(entry.generalText).toBeNull();
  });
});

describe("describeProducts", () => {
  it("joins the product names", () => {
    expect(
      describeProducts([product("sola", "dt-mri"), product("gotop", "dt-ct")]),
    ).toEqual({
      subtitle: "Product sola \u00b7 Product gotop",
    });
  });
});
