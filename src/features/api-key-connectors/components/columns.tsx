"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { SortableHeader } from "@/components/ui/data-table";
import type { ConnectorResponse } from "../types";

export const columns: ColumnDef<ConnectorResponse>[] = [
  {
    id: "name",
    accessorKey: "name",
    header: ({ column }) => (
      <SortableHeader header="Connector Name" column={column} />
    ),
  },
  {
    accessorKey: "Username",
    meta: { title: "Username" },
    header: "Username",
    accessorFn: (row) => row.user.name,
  },
  {
    id: "lastRequest",
    accessorKey: "lastRequest",
    header: ({ column }) => (
      <SortableHeader header="Last Used" column={column} />
    ),
    cell: ({ getValue }) => {
      return getValue() ?? "Never";
    },
  },
  {
    id: "status",
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => {
      let text = "Active";
      let color = "bg-green-300";
      if (!row.original.apiKeyId) {
        text = "Expired";
        color = "bg-red-400";
      }

      return (
        <Badge variant="outline" className={color}>
          {text}
        </Badge>
      );
    },
  },
  {
    id: "type",
    accessorKey: "type",
    header: "Type",
    cell: ({ row }) => {
      let text = "API Key";
      let color = "bg-blue-300";
      if (row.original.integrationId) {
        text = "Integration";
        color = "bg-yellow-300";
      }

      return (
        <Badge variant="outline" className={color}>
          {text}
        </Badge>
      );
    },
  },
];
