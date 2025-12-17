"use client";

import { ColumnDef } from "@tanstack/react-table";
import { formatDistanceToNow } from "date-fns";

import { Badge } from "@/components/ui/badge";
import type { VulnerabilityWithIssues } from "@/lib/db";
import { SortableHeader } from "@/components/ui/data-table";
import { CopyCode } from "@/components/ui/code";
import { VulnerabilityDrawer } from "./vulnerabilities";

export const columns: ColumnDef<VulnerabilityWithIssues>[] = [
  {
    accessorKey: "description",
    header: ({ column }) => (
      <SortableHeader header="Description" column={column} />
    ),
    cell: ({ row }) => (
      <VulnerabilityDrawer vulnerability={row.original}>
        <div className="max-w-[500px] overflow-hidden text-ellipsis hover:underline pb-[1px]">
          {row.original.description}
        </div>
      </VulnerabilityDrawer>
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
    header: "Last Updated",
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
