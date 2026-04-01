"use client";

import type { ColumnDef } from "@tanstack/table-core";
import { formatDistanceToNow } from "date-fns";
import { SeverityBadge } from "@/components/severity-badge";
import { SortableHeader } from "@/components/ui/data-table";
import { IssueStatusBadge } from "@/features/issues/components/issue";
import type { AdvisoryWithRelations } from "../types";
import { TlpBadge } from "./advisories";

type AdvisoryRow = AdvisoryWithRelations & { affectedAssetCount: number };

export const columns: ColumnDef<AdvisoryRow>[] = [
  {
    id: "title",
    accessorKey: "title",
    header: ({ column }) => <SortableHeader header="Title" column={column} />,
    cell: ({ row }) =>
      row.original.title ?? (
        <span className="text-muted-foreground font-mono text-xs">
          {row.original.id.slice(0, 12)}…
        </span>
      ),
  },
  {
    id: "severity",
    accessorKey: "severity",
    meta: { title: "Severity" },
    header: "Severity",
    cell: ({ row }) => <SeverityBadge severity={row.original.severity} />,
  },
  {
    id: "tlp",
    accessorKey: "tlp",
    meta: { title: "TLP" },
    header: "TLP",
    cell: ({ row }) =>
      row.original.tlp ? <TlpBadge tlp={row.original.tlp} /> : null,
  },
  {
    id: "status",
    accessorKey: "status",
    meta: { title: "Status" },
    header: "Status",
    cell: ({ row }) => <IssueStatusBadge status={row.original.status} />,
  },
  {
    id: "affectedAssets",
    accessorKey: "affectedAssetCount",
    meta: { title: "Affected Assets" },
    header: "Affected Assets",
    cell: ({ row }) => row.original.affectedAssetCount,
  },
  {
    id: "publishedAt",
    accessorKey: "publishedAt",
    meta: { title: "Published" },
    header: "Published",
    cell: ({ row }) =>
      row.original.publishedAt
        ? formatDistanceToNow(row.original.publishedAt, { addSuffix: true })
        : "—",
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
];
