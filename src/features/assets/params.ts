import { parseAsStringEnum } from "nuqs/server";
import { createPaginationParams } from "@/lib/url-state";
import { PAGINATION } from "@/config/constants";
import { IssueStatus } from "@/generated/prisma";
import { parseAsInteger, parseAsString } from "nuqs/server";

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
  activeIssuePage: parseAsInteger
    .withDefault(PAGINATION.DEFAULT_PAGE)
    .withOptions({ clearOnDefault: true }),
  falsePosIssuePage: parseAsInteger
    .withDefault(PAGINATION.DEFAULT_PAGE)
    .withOptions({ clearOnDefault: true }),
  remediatedIssuePage: parseAsInteger
    .withDefault(PAGINATION.DEFAULT_PAGE)
    .withOptions({ clearOnDefault: true }),
  issueStatus: parseAsString.withDefault(IssueStatus.PENDING.toString()),
};
