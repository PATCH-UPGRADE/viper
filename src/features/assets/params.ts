import type { SingleParserBuilder } from "nuqs";
import { parseAsInteger, parseAsStringEnum } from "nuqs/server";
import { PAGINATION } from "@/config/constants";
import { IssueStatus } from "@/generated/prisma";
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

const issueStatusPageParams: Record<string, SingleParserBuilder<number>> = {};
for (const status of Object.values(IssueStatus)) {
  const key = `${status.toLowerCase()}Page`;
  issueStatusPageParams[key] = parseAsInteger
    .withDefault(PAGINATION.DEFAULT_PAGE)
    .withOptions({ clearOnDefault: true });
}

export const assetDetailParams = {
  ...issueStatusPageParams,
  issueStatus: parseAsStringEnum<IssueStatus>(Object.values(IssueStatus))
    .withDefault(IssueStatus.ACTIVE)
    .withOptions({ clearOnDefault: true }),
};
