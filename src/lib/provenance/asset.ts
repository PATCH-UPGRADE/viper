import "server-only";
import type { Prisma } from "@/generated/prisma";
import type {
  EntityDefinition,
  FieldMap,
  FieldWithMark,
  ModelScalars,
} from "./types";

const fields = {
  ip: "tracked",
  hostname: "tracked",
  macAddress: "tracked",
  serialNumber: "tracked",
  location: "tracked",
  manufacturerId: "tracked",
  productId: "tracked",
  versionId: "tracked",
  versionStatus: "tracked",

  // Likely to change significantly, so not worth a history yet.
  networkSegment: "ignored",
  role: "ignored",
  status: "ignored",
  // A large hourly grid, so each change would store several copies of it.
  utilization: "ignored",

  // Set by the database.
  id: "ignored",
  createdAt: "ignored",
  updatedAt: "ignored",

  // TODO VW-605 (PR 5): the column and its relation are dropped. The CREATE
  // observation says who created the asset.
  userId: "ignored",
  user: "ignored",

  // Tracked through their foreign key.
  manufacturer: "ignored",
  product: "ignored",
  version: "ignored",

  // Rows of other models that point at the asset.
  issues: "ignored",
  externalMappings: "ignored",
  assetTickets: "ignored",
  sourceRecordMappings: "ignored",
  nodes: "ignored",
  managedBy: "ignored",
} as const satisfies FieldMap<"Asset">;

// A version must belong to its product, and a product to its manufacturer.
const groups = {
  device: ["manufacturerId", "productId", "versionId", "versionStatus"],
} as const satisfies Record<
  string,
  readonly FieldWithMark<typeof fields, "tracked">[]
>;

export const assetEntity = {
  model: "Asset",
  fields,
  groups,
  jsonFields: ["location", "utilization"],
  emptyIsNull: ["ip", "hostname", "macAddress", "serialNumber"],
  labels: {
    manufacturerId: async (tx, id) =>
      (
        await tx.manufacturer.findUnique({
          where: { id },
          select: { canonicalDisplayName: true },
        })
      )?.canonicalDisplayName,
    productId: async (tx, id) =>
      (
        await tx.product.findUnique({
          where: { id },
          select: { canonicalDisplayName: true },
        })
      )?.canonicalDisplayName,
    versionId: async (tx, id) =>
      (
        await tx.version.findUnique({
          where: { id },
          select: { canonicalDisplayName: true },
        })
      )?.canonicalDisplayName,
  },
  // Not FOR UPDATE: that also blocks inserting rows that point at the asset,
  // so two transactions that each add a mapping first would deadlock.
  lock: (tx, id) =>
    tx.$queryRaw`SELECT 1 FROM asset WHERE id = ${id} FOR NO KEY UPDATE`,
  read: (tx, id) =>
    tx.asset.findUnique({ where: { id }, omit: { utilization: true } }),
  update: (tx, id, data) =>
    tx.asset.update({
      where: { id },
      data: data as Prisma.AssetUncheckedUpdateInput,
      select: { id: true },
    }),
} as const satisfies EntityDefinition<"Asset">;

type AssetScalars = ModelScalars<"Asset">;
type DeviceField = (typeof groups)["device"][number];

/**
 * The fields of an asset that a source states. A missing key means it said
 * nothing about that field, and null says the field is empty. A source states
 * all four device fields or none of them.
 */
export type AssetInput = Partial<
  Pick<AssetScalars, "ip" | "hostname" | "macAddress" | "serialNumber">
> & { location?: Prisma.InputJsonValue | null } & Partial<
    Pick<AssetScalars, "networkSegment" | "role" | "status">
  > & { utilization?: Prisma.InputJsonValue | null } & (
    | Pick<AssetScalars, DeviceField>
    | { [K in DeviceField]?: undefined }
  );
