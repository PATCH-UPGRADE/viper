"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { formatDistanceToNow } from "date-fns";

import { Badge } from "@/components/ui/badge";
import { CopyCode } from "@/components/ui/code";
import { SortableHeader } from "@/components/ui/data-table";
import type { VulnerabilityWithIssues } from "@/lib/db";

export const columns: ColumnDef<VulnerabilityWithIssues>[] = [
  {
    accessorKey: "description",
    header: ({ column }) => (
      <SortableHeader header="Description" column={column} />
    ),
    cell: ({ row }) => (
      <div className="max-w-[500px] overflow-hidden text-ellipsis">
        {row.original.description}
      </div>
    ),
  },
  {
    accessorKey: "issues",
    header: ({ column }) => (
      <SortableHeader header="Affected Assets" column={column} />
    ),
    cell: ({ row }) => {
      const numAssets = row.original.issues.length;
      return (
        <div>
          <Badge variant={numAssets === 0 ? "outline" : "destructive"}>
            {numAssets >= 1 ? (
              <>
                {numAssets} Asset{numAssets === 1 ? "" : "s"}
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
    accessorKey: "cpe",
    meta: { title: "Group ID" },
    header: ({ column }) => (
      <SortableHeader header="Group ID" column={column} />
    ),
    cell: ({ row }) => {
      return <CopyCode>{row.original.cpe}</CopyCode>;
    },
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
  /*{
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
            <DropdownMenuItem onClick={() => handleCopy(asset.cpe)}>
              <CopyIcon strokeWidth={3} /> Copy Group ID
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleCopy(asset.id)}>
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
  }*/
];
