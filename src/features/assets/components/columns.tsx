"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { formatDistanceToNow } from "date-fns";
import { CopyIcon, TrashIcon } from "lucide-react";
import { toast } from "sonner";
import { CopyCode } from "@/components/ui/code";
import { SortableHeader } from "@/components/ui/data-table";
import { MoreVerticalDropdownMenu } from "@/components/ui/dropdown-menu";
import { handleCopy } from "@/lib/copy";
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
      return <CopyCode>{row.original.deviceGroup.cpe}</CopyCode>;
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

const actionsColumn: ColumnDef<AssetResponse> = {
  id: "actions",
  enableHiding: false,
  cell: ({ row }) => {
    const asset = row.original;

    return (
      <MoreVerticalDropdownMenu
        contentClassName="w-[200px]"
        items={[
          {
            items: [
              { label: "Go to Asset Details", href: `/assets/${asset.id}` },
            ],
          },
          {
            label: "Quick Actions",
            items: [
              {
                label: "Copy Group ID",
                icon: <CopyIcon strokeWidth={3} />,
                onClick: () =>
                  handleCopy(asset.deviceGroup.cpe, () =>
                    toast.success("Copied!"),
                  ),
              },
              {
                label: "Copy Asset ID",
                icon: <CopyIcon strokeWidth={3} />,
                onClick: () =>
                  handleCopy(asset.id, () => toast.success("Copied!")),
              },
            ],
          },
          {
            items: [
              {
                label: "Delete Asset",
                icon: <TrashIcon strokeWidth={3} />,
                onClick: () => console.log("TODO"),
                variant: "destructive",
              },
            ],
          },
        ]}
      />
    );
  },
};

export const columnsWithActions = [...columns, actionsColumn];
