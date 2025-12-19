"use client";

import { ColumnDef } from "@tanstack/react-table";
import { MoreVertical, CopyIcon, TrashIcon } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import type { AssetWithIssues } from "@/lib/db";
import { AssetDrawer } from "./assets";
import {
  TooltipContent,
  Tooltip,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { handleCopy } from "@/lib/copy";
import { SortableHeader } from "@/components/ui/data-table";
import { toast } from "sonner";

export const columns: ColumnDef<AssetWithIssues>[] = [
  {
    id: "role",
    accessorKey: "role",
    header: ({ column }) => <SortableHeader header="Role" column={column} />,
    cell: ({ row }) => {
      return <AssetDrawer asset={row.original} />;
    },
  },
  {
    id: "issues",
    accessorKey: "issues",
    header: ({ column }) => (
      <SortableHeader header="Active Vulnerabilities" column={column} />
    ),
    cell: ({ row }) => {
      const numVulns = row.original.issues.length;
      return (
        <div>
          <Badge variant={numVulns === 0 ? "outline" : "destructive"}>
            {numVulns >= 1 ? (
              <>
                {numVulns} Vuln{numVulns === 1 ? "" : "s"}.
              </>
            ) : (
              "None"
            )}
          </Badge>
        </div>
      );
    },
  },
  {
    id: "IP Address",
    accessorKey: "ip",
    header: "IP Address",
  },
  {
    accessorKey: "cpe",
    meta: { title: "Class" },
    header: ({ column }) => <SortableHeader header="Class" column={column} />,
    cell: ({ row }) => {
      return (
        <Tooltip>
          <TooltipTrigger>
            {row.original.cpe.split(":").slice(3, 5).join(" ")}
          </TooltipTrigger>
          <TooltipContent>{row.original.cpe}</TooltipContent>
        </Tooltip>
      );
    },
  },
  {
    accessorKey: "updatedAt",
    meta: { title: "Last Updated" },
    header: "Last Updated",
    accessorFn: (row) =>
      formatDistanceToNow(row.updatedAt, { addSuffix: true }),
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
            <DropdownMenuLabel>Quick Actions</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() =>
                handleCopy(asset.cpe, () => toast.success("Copied!"))
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
