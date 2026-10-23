"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { formatDistanceToNow } from "date-fns";

import { CopyCode } from "@/components/ui/code";
import { SortableHeader } from "@/components/ui/data-table";
import { deviceGroupMatchingsSummary } from "@/lib/markdown";
import type { VulnerabilityResponse } from "../types";
import { VulnerabilitySources } from "./vulnerability-sources";

export const columns: ColumnDef<VulnerabilityResponse>[] = [
  {
    accessorKey: "displayId",
    meta: { title: "ID" },
    header: ({ column }) => <SortableHeader header="ID" column={column} />,
    cell: ({ row }) => (
      <span className="font-mono text-xs">{row.original.displayId}</span>
    ),
  },
  {
    id: "affected",
    meta: { title: "Affected" },
    header: "Affected",
    cell: ({ row }) => {
      return (
        <CopyCode>
          {deviceGroupMatchingsSummary(row.original.deviceGroupMatchings)}
        </CopyCode>
      );
    },
  },
  {
    accessorKey: "description",
    header: ({ column }) => (
      <SortableHeader header="Description" column={column} />
    ),
    cell: ({ row }) => (
      <div className="max-w-[500px] overflow-hidden text-ellipsis whitespace-nowrap">
        {row.original.description}
      </div>
    ),
  },
  {
    id: "sources",
    meta: { title: "Sources" },
    header: "Sources",
    cell: ({ row }) => <VulnerabilitySources records={row.original.records} />,
  },
  {
    accessorKey: "updatedAt",
    meta: { title: "Last Updated" },
    header: ({ column }) => (
      <SortableHeader header="Last Updated" column={column} />
    ),
    accessorFn: (row) =>
      formatDistanceToNow(row.updatedAt, { addSuffix: true }),
  },
];
