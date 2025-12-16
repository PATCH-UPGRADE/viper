"use client";

import { ColumnDef } from "@tanstack/react-table";
import { MoreVertical, ArrowUpDown, CopyIcon, TrashIcon } from "lucide-react";
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
import { AssetWithIssues } from "@/lib/db";
import { AssetDrawer } from "./assets";

/*export type Payment = {
  id: string
  amount: number
  status: "pending" | "processing" | "success" | "failed"
  email: string
}*/

export const SortableHeader = ({
  header,
  column,
}: {
  header: string;
  column: any;
}) => {
  return (
    <Button
      variant="link"
      className="text-muted-foreground px-0!"
      onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
    >
      {header}
      <ArrowUpDown className="ml-2 h-4 w-4" />
    </Button>
  );
};

export const columns: ColumnDef<AssetWithIssues>[] = [
  {
    accessorKey: "role",
    header: ({ column }) => <SortableHeader header="Role" column={column} />,
    cell: ({ row }) => {
      return <AssetDrawer asset={row.original} />;
    },
  },
  {
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
    id: "Class",
    header: ({ column }) => <SortableHeader header="Class" column={column} />,
    accessorFn: (row) => row.cpe.split(":").slice(3, 5).join(" "),
  },
  {
    id: "Last Updated",
    header: "Last Updated",
    accessorFn: (row) =>
      formatDistanceToNow(row.updatedAt, { addSuffix: true }),
  },
  {
    id: "actions",
    enableHiding: false,
    cell: ({ row }) => {
      const payment = row.original;

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
            <DropdownMenuItem onClick={() => console.log("TODO")}>
              <CopyIcon strokeWidth={3} /> Copy Group ID
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => console.log("TODO")}>
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
