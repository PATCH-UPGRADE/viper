import type { inferOutput } from "@trpc/tanstack-react-query";
import type { Prisma } from "@/generated/prisma";
import type { trpc } from "@/trpc/server";

export const vendorListSelect = {
  id: true,
  canonicalName: true,
  canonicalDisplayName: true,
  overview: true,
  partnerSince: true,
  contracts: { select: { covers: { select: { assetId: true } } } },
} satisfies Prisma.VendorSelect;

export type VendorListRow = Prisma.VendorGetPayload<{
  select: typeof vendorListSelect;
}>;

export type VendorListItem = inferOutput<
  typeof trpc.vendors.getMany
>["items"][number];
