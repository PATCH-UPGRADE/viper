"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { formatDistanceToNow } from "date-fns";
import { CopyCode } from "@/components/ui/code";
import { SortableHeader } from "@/components/ui/data-table";
import { deviceGroupCpeList } from "@/lib/markdown";
import type { AssetResponse } from "../types";

export const columns: ColumnDef<AssetResponse>[] = [
  {
    id: "role",
    accessorKey: "role",
    header: ({ column }) => <SortableHeader header="Role" column={column} />,
  },
  {
    meta: { title: "IP Address" },
    accessorKey: "ip",
    header: "IP Address",
  },
  {
    accessorKey: "deviceGroupId",
    meta: { title: "CPE" },
    header: ({ column }) => <SortableHeader header="CPE" column={column} />,
    cell: ({ row }) => {
      return (
        <CopyCode>{deviceGroupCpeList(row.original.deviceGroup)}</CopyCode>
      );
    },
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
    cell: ({ row }) =>
      formatDistanceToNow(row.original.updatedAt, { addSuffix: true }),
  },
];
