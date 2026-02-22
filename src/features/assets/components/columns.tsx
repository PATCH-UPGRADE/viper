"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { formatDistanceToNow } from "date-fns";
import { CopyIcon, MoreVertical, TrashIcon } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { CopyCode } from "@/components/ui/code";
import { SortableHeader } from "@/components/ui/data-table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  {
    id: "actions",
    enableHiding: false,
    cell: ({ row }) => {
      const asset = row.original;

      return (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-8 w-8 p-0">
              <span className="sr-only">Open menu</span>
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-[200px]">
            <DropdownMenuItem asChild>
              <Link href={`/assets/${asset.id}`}>Go to Asset Details</Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Quick Actions</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() =>
                handleCopy(asset.deviceGroup.cpe, () =>
                  toast.success("Copied!"),
                )
              }
            >
              <CopyIcon strokeWidth={3} /> Copy Group ID
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() =>
                handleCopy(asset.id, () => toast.success("Copied!"))
              }
            >
              <CopyIcon strokeWidth={3} /> Copy Asset ID
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => console.log("TODO")}
              variant="destructive"
            >
              <TrashIcon strokeWidth={3} /> Delete Asset
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      );
    },
  },
];
