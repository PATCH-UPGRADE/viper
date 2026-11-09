"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { formatDistanceToNow } from "date-fns";
import Link from "next/link";
import { SeverityBadge, severityConfig } from "@/components/severity-badge";
import { SourceBlocks } from "@/components/sources";
import { Badge } from "@/components/ui/badge";
import { SortableHeader } from "@/components/ui/data-table";
import { MoreVerticalDropdownMenu } from "@/components/ui/dropdown-menu";
import {
  countAffectedRemediations,
  getAssetDeviceTypeLabel,
  getAssetSourceBlocks,
  getAssetSources,
  getAssetTitle,
} from "@/features/assets/utils";
import { IssueStatusForm } from "@/features/issues/components/issue";
import { IssueStatus, Severity } from "@/generated/prisma";
import type { AssetWithIssueRelations } from "../types";

type AssetIssue = AssetWithIssueRelations["issues"][number];

function countActiveBySeverity(
  issues: AssetIssue[],
  severity: Severity,
): number {
  return issues.filter(
    (i) =>
      i.status === IssueStatus.AFFECTED &&
      i.vulnerability.severity === severity,
  ).length;
}

function totalActiveIssues(issues: AssetIssue[]): number {
  return issues.filter((i) => i.status === IssueStatus.AFFECTED).length;
}

const SEVERITY_COL_COUNT = 4;

function createSeverityColumn(
  severity: Severity,
  isFirst: boolean,
): ColumnDef<AssetWithIssueRelations> {
  const config = severityConfig[severity];
  return {
    id: `severity_${severity}`,
    meta: {
      title: config.label,
      headerClassName: "w-10",
      ...(isFirst && {
        colSpan: (row) => {
          const active = totalActiveIssues(row.original.issues);
          return active === 0 ? SEVERITY_COL_COUNT : 1;
        },
      }),
    },
    header: ({ column }) => (
      <SortableHeader
        header={config.short}
        column={column}
        tooltip={config.label}
      />
    ),
    cell: ({ row }) => {
      const issues = row.original.issues;
      const active = totalActiveIssues(issues);

      if (active === 0) {
        if (isFirst) {
          return (
            <Badge className="bg-green-600 hover:bg-green-600 text-white whitespace-nowrap w-full">
              No active issues
            </Badge>
          );
        }
        return null;
      }

      const count = countActiveBySeverity(issues, severity);
      if (count === 0) return <span className="text-muted-foreground">—</span>;
      return <Badge className={config.badgeClassName}>{count}</Badge>;
    },
  };
}

/**
 * "Product • Device Type", like the asset drawer's title, over "Manufacturer • IP address" in small
 * muted text. An asset with no product shows getAssetTitle instead.
 */
function DeviceCell({ asset }: { asset: AssetWithIssueRelations }) {
  const product = asset.product?.canonicalDisplayName;
  const deviceType = getAssetDeviceTypeLabel(asset);
  const details = [asset.manufacturer?.canonicalDisplayName, asset.ip].filter(
    Boolean,
  );
  return (
    <div className="flex flex-col">
      <span className="flex flex-wrap items-center gap-x-1.5">
        <span className="font-medium">{product ?? getAssetTitle(asset)}</span>
        {product && deviceType && (
          <span className="text-[0.9em]">&bull; {deviceType}</span>
        )}
      </span>
      {details.length > 0 && (
        <span className="text-xs text-muted-foreground">
          {details.join(" \u2022 ")}
        </span>
      )}
    </div>
  );
}

export const dashboardColumns: ColumnDef<AssetWithIssueRelations>[] = [
  {
    // The product and its device type, with the manufacturer and IP address underneath. Not
    // sortable: it shows four fields, and no one of them is the obvious sort key.
    id: "device",
    meta: { title: "Device" },
    header: "Device",
    enableSorting: false,
    cell: ({ row }) => <DeviceCell asset={row.original} />,
  },
  createSeverityColumn(Severity.Critical, true),
  createSeverityColumn(Severity.High, false),
  createSeverityColumn(Severity.Medium, false),
  createSeverityColumn(Severity.Low, false),
  {
    id: "sources",
    meta: { title: "Sources", headerClassName: "pl-6", cellClassName: "pl-6" },
    header: "Sources",
    accessorFn: (row) => getAssetSources(row).join(", "),
    // TODO VW-600: use the data provenance models (see getAssetSourceBlocks).
    cell: ({ row }) => (
      <SourceBlocks blocks={getAssetSourceBlocks(row.original)} />
    ),
  },
  {
    id: "remediations",
    header: ({ column }) => (
      <SortableHeader header="Remediations Available" column={column} />
    ),
    accessorFn: (row) => countAffectedRemediations(row.issues),
    cell: ({ row }) => {
      const count = countAffectedRemediations(row.original.issues);
      return (
        <Badge variant={count === 0 ? "destructive" : "secondary"}>
          {count === 0 ? "None" : count}
        </Badge>
      );
    },
  },
  {
    id: "updatedAt",
    accessorKey: "updatedAt",
    header: ({ column }) => (
      <SortableHeader header="Last Updated" column={column} />
    ),
    cell: ({ row }) =>
      formatDistanceToNow(row.original.updatedAt, { addSuffix: true }),
  },
  {
    id: "actions",
    enableHiding: false,
    header: "",
    cell: ({ row }) => (
      <MoreVerticalDropdownMenu
        items={[
          { label: "Go to Asset Details", href: `/assets/${row.original.id}` },
        ]}
      />
    ),
  },
];

export const assetIssueColumns: ColumnDef<AssetIssue>[] = [
  {
    accessorKey: "id",
    header: "Issue ID",
    cell: ({ row }) => (
      <Link
        href={`/issues/${row.original.id}`}
        className="font-mono text-sm text-primary underline hover:text-primary/80"
      >
        {row.original.id}
      </Link>
    ),
  },
  {
    accessorKey: "vulnerability.displayId",
    header: "ID",
    cell: ({ row }) => row.original.vulnerability.displayId,
  },
  {
    accessorKey: "vulnerability.severity",
    header: "Severity",
    cell: ({ row }) => (
      <SeverityBadge severity={row.original.vulnerability.severity} />
    ),
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => (
      <IssueStatusForm className="ml-auto" issue={row.original} />
    ),
  },
  {
    accessorKey: "updatedAt",
    header: "Updated At",
    cell: ({ row }) =>
      formatDistanceToNow(row.original.updatedAt, { addSuffix: true }),
  },
  {
    id: "actions",
    header: "",
    cell: ({ row }) => (
      <MoreVerticalDropdownMenu
        items={[
          {
            label: "Go to Vulnerability",
            href: `/vulnerabilities/${row.original.vulnerabilityId}`,
          },
          { label: "Go to Issue Details", href: `/issues/${row.original.id}` },
        ]}
      />
    ),
  },
];
