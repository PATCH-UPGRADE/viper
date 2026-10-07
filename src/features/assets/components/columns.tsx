"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { formatDistanceToNow } from "date-fns";
import { ClampedCell } from "@/components/ui/clamped-cell";
import { CopyCode } from "@/components/ui/code";
import { SortableHeader } from "@/components/ui/data-table";
import { deviceGroupCpeList } from "@/lib/markdown";
import type { AssetResponse } from "../types";
import { getAssetDeviceTypeLabel } from "../utils";

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
