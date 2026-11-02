import type { DeviceGuides } from "./server/routers";

export type PageProduct = {
  productId: string;
  product: string;
  deviceTypeId: string | null;
};

export function describeProducts(products: PageProduct[]) {
  return {
    subtitle: products.map((p) => p.product).join(" \u00b7 "),
  };
}

export function toProductGuides(products: PageProduct[], guides: DeviceGuides) {
  const deviceTypeById = new Map(guides.deviceTypes.map((d) => [d.id, d]));
  const productTextById = new Map(
    guides.productGuides.map((g) => [g.productId, g.body]),
  );

  return products.map((p) => {
    const deviceType = p.deviceTypeId
      ? deviceTypeById.get(p.deviceTypeId)
      : undefined;
    return {
      productId: p.productId,
      product: p.product,
      deviceType: deviceType?.displayName ?? null,
      generalText: deviceType?.generalText ?? null,
      productText: productTextById.get(p.productId) ?? null,
    };
  });
}
