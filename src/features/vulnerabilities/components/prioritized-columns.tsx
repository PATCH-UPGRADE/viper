"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { formatDistanceToNow } from "date-fns";
import { MoreVertical } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SortableHeader } from "@/components/ui/data-table";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { QuestionTooltip } from "@/components/ui/question-tooltip";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { IssueStatusForm } from "@/features/issues/components/issue";
import type { VulnerabilityWithRelations } from "../types";

export const prioritizedColumns: ColumnDef<VulnerabilityWithRelations>[] = [
  {
    accessorKey: "id",
    header: ({ column }) => <SortableHeader header="ID" column={column} />,
    cell: ({ row }) => (
      <Link
        href={`/vulnerabilities/${row.original.id}`}
        className="text-primary underline hover:text-primary/80"
      >
        {row.original.id}
      </Link>
    ),
  },
  {
    accessorKey: "cveId",
    header: ({ column }) => <SortableHeader header="CVE ID" column={column} />,
    cell: ({ row }) => row.original.cveId || "—",
  },
  {
    accessorKey: "user.name",
    header: ({ column }) => (
      <SortableHeader header="Source Tool" column={column} />
    ),
    cell: ({ row }) => row.original.user.name,
  },
  {
    accessorKey: "createdAt",
    header: ({ column }) => (
      <SortableHeader header="First Seen" column={column} />
    ),
    cell: ({ row }) => (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger>
            {formatDistanceToNow(row.original.createdAt, { addSuffix: true })}
          </TooltipTrigger>
          <TooltipContent>
            {row.original.createdAt.toLocaleString()}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    ),
  },
  {
    accessorKey: "inKEV",
    header: ({ column }) => (
      <div className="flex items-center gap-2">
        <SortableHeader header="In KEV?" column={column} />
        <QuestionTooltip>
          Known Exploited Vulnerabilities (KEV) - Vulnerabilities listed in
          CISA's catalog of exploits actively used in the wild
        </QuestionTooltip>
      </div>
    ),
    cell: ({ row }) => (
      <Badge variant={row.original.inKEV ? "destructive" : "outline"}>
        {row.original.inKEV ? "True" : "False"}
      </Badge>
    ),
  },
  {
    accessorKey: "remediations",
    header: ({ column }) => (
      <SortableHeader header="Remediations Available" column={column} />
    ),
    cell: ({ row }) => {
      const count = row.original.remediations.length;
      return (
        <Badge variant={count === 0 ? "destructive" : "secondary"}>
          {count === 0 ? "None" : count}
        </Badge>
      );
    },
  },
];

// Define the type for a single issue (extracted from VulnerabilityWithRelations)
type VulnerabilityIssue = VulnerabilityWithRelations["issues"][number];

export const issueColumns: ColumnDef<VulnerabilityIssue>[] = [
  {
    accessorKey: "id",
    header: "Issue ID",
    cell: ({ row }) => (
      <Link
        href={`/issues/${row.original.id}`}
        className="font-mono text-sm text-primary underline hover:text-primary/80"
      >
        {row.original.id}
      </Link>
    ),
  },
  {
    accessorKey: "asset",
    header: "Affected Asset",
    cell: ({ row }) => row.original.asset.role,
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => (
      <IssueStatusForm className="ml-auto" issue={row.original} />
    ),
  },
  {
    accessorKey: "updatedAt",
    header: "Updated At",
    cell: ({ row }) =>
      formatDistanceToNow(row.original.updatedAt, { addSuffix: true }),
  },
  {
    id: "actions",
    header: "",
    cell: ({ row }) => (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
            <MoreVertical className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem asChild>
            <Link href={`/assets/${row.original.asset.id}`}>
              Go to Asset Details
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href={`/issues/${row.original.id}`}>Go to Issue Details</Link>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    ),
  },
];
