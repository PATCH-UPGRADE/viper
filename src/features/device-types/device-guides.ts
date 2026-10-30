import type { DeviceGuides } from "./server/routers";

export type PageProduct = {
  productId: string;
  product: string;
  deviceTypeId: string | null;
  assetCount: number;
};

export type DeviceGuidesGroup = {
  key: string;
  deviceType: string | null;
  generalText: string | null;
  assetCount: number;
  products: {
    productId: string;
    product: string;
    productText: string | null;
  }[];
};

function byDeviceType(a: DeviceGuidesGroup, b: DeviceGuidesGroup) {
  if (a.deviceType === b.deviceType) return 0;
  if (a.deviceType === null) return 1;
  if (b.deviceType === null) return -1;
  return a.deviceType.localeCompare(b.deviceType);
}

export function groupByDeviceType(
  products: PageProduct[],
  guides: DeviceGuides,
) {
  const deviceTypeId = new Map(guides.deviceTypes.map((d) => [d.id, d]));
  const productTextById = new Map(
    guides.productGuides.map((g) => [g.productId, g.body]),
  );

  const groups = new Map<string, DeviceGuidesGroup>();

  for (const p of products) {
    const deviceType = p.deviceTypeId
      ? deviceTypeId.get(p.deviceTypeId)
      : undefined;
    const key = deviceType?.id ?? `product:${p.productId}`;
    const group = groups.get(key) ?? {
      key,
      deviceType: deviceType?.displayName ?? null,
      generalText: deviceType?.generalText ?? null,
      assetCount: 0,
      products: [],
    };
    group.assetCount += p.assetCount;
    group.products.push({
      productId: p.productId,
      product: p.product,
      productText: productTextById.get(p.productId) ?? null,
    });
    groups.set(key, group);
  }
  return [...groups.values()].sort(byDeviceType);
}

export function describeProducts(products: PageProduct[]) {
  return {
    deviceCount: products.reduce((n, p) => n + p.assetCount, 0),
    subtitle: products.map((p) => p.product).join("\u2022"),
  };
}

export function toProductGuides(products: PageProduct[], guides: DeviceGuides) {
      const deviceTypeId = new Map(guides.deviceTypes.map((d) => [d.id, d]));
  const productTextById = new Map(
    guides.productGuides.map((g) => [g.productId, g.body]),
  );

  return products.map((p) => {
    const deviceType = p.deviceTypeId ? deviceTypeId.get(p.deviceTypeId) : undefined;
    return {
        productId: p.productId,
        product: p.product,
        deviceType: deviceType?.displayName ?? null,
        generalText: deviceType?.generalText ?? null,
        productText: productTextById.get(p.productId) ?? null
    }
  })
}
