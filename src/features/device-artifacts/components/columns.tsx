"use client";

import type { ColumnDef } from "@tanstack/table-core";
import { formatDistanceToNow } from "date-fns";
import { SortableHeader } from "@/components/ui/data-table";
import type { DeviceArtifactResponse } from "../types";

export const columns: ColumnDef<DeviceArtifactResponse>[] = [
  {
    id: "role",
    accessorKey: "role",
    header: ({ column }) => <SortableHeader header="Role" column={column} />,
  },
  {
    accessorKey: "description",
    meta: { title: "Description" },
    header: "Description",
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
