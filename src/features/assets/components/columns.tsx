"use client";

import { ColumnDef } from "@tanstack/react-table";
import { MoreVertical, ArrowUpDown } from "lucide-react";
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

export const columns: ColumnDef<AssetWithIssues>[] = [
  {
    accessorKey: "role",
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Role
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      );
    },
    cell: ({ row }) => {
      return <AssetDrawer asset={row.original} />;
    },
  },
  {
    accessorKey: "issues",
    header: "Vulnerabilities",
    cell: ({ row }) => {
      const numVulns = row.original.issues.length;
      return (
        <div>
          <Badge variant={numVulns === 0 ? "outline" : "destructive"}>
            {numVulns} Detected
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
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Actions</DropdownMenuLabel>
            <DropdownMenuItem
              onClick={() => navigator.clipboard.writeText(payment.id)}
            >
              Copy payment ID
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem>View customer</DropdownMenuItem>
            <DropdownMenuItem>View payment details</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      );
    },
  },
];
