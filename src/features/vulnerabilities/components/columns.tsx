"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { formatDistanceToNow } from "date-fns";

import { CopyCode } from "@/components/ui/code";
import { SortableHeader } from "@/components/ui/data-table";
import type { VulnerabilityResponse } from "../types";

export const columns: ColumnDef<VulnerabilityResponse>[] = [
  {
    accessorKey: "cveId",
    meta: { title: "CVE ID" },
    header: ({ column }) => <SortableHeader header="CVE ID" column={column} />,
    cell: ({ row }) => (
      <span className="font-mono text-xs">{row.original.cveId ?? "—"}</span>
    ),
  },
  {
    id: "cpe",
    meta: { title: "CPE" },
    header: "CPE",
    cell: ({ row }) => {
      return (
        <CopyCode>
          {row.original.affectedDeviceGroups
            .map((group) => group.cpe)
            .join(", ")}
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
    accessorKey: "userId",
    meta: { title: "Source Tool" },
    header: "Source Tool",
    accessorFn: (row) => row.user.name,
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
