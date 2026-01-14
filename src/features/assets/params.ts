import { parseAsStringEnum } from "nuqs/server";
import { createPaginationParams } from "@/lib/url-state";

export enum SortableAssetColumns {
  role = "role",
  roleDesc = "-role",
  vulns = "issues",
  vulnsDesc = "-issues",
  class = "cpe",
  classDesc = "-cpe",
  null = "",
}

export const assetsParams = {
  ...createPaginationParams(),
  ...{
    sort: parseAsStringEnum<SortableAssetColumns>(
      Object.values(SortableAssetColumns),
    )
      .withDefault(SortableAssetColumns.null)
      .withOptions({ clearOnDefault: true }),
  },
};

export const assetDetailParams = {
  ...createPaginationParams(),
  status: 'PENDING',
};
