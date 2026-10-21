"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { formatDistanceToNow } from "date-fns";
import { ClampedCell } from "@/components/ui/clamped-cell";
import { SortableHeader } from "@/components/ui/data-table";
import type { AssetResponse } from "../types";
import { getAssetDeviceTypeLabel, getSourceToolLabel } from "../utils";

export const columns: ColumnDef<AssetResponse>[] = [
  {
    id: "deviceType",
    meta: { title: "Device Type" },
    header: ({ column }) => (
      <SortableHeader header="Device Type" column={column} />
    ),
    accessorFn: getAssetDeviceTypeLabel,
    cell: ({ getValue }) => <ClampedCell text={getValue<string | null>()} />,
  },
  {
    meta: { title: "IP Address" },
    accessorKey: "ip",
    header: "IP Address",
  },
  {
    accessorKey: "userId",
    meta: { title: "Source Tool" },
    header: "Source Tool",
    accessorFn: getSourceToolLabel,
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
