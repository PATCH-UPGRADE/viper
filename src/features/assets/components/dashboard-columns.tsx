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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { IssueStatusForm } from "@/features/issues/components/issue";
import { IssueStatus, Severity } from "@/generated/prisma";
import type { AssetWithIssueRelations } from "../types";

type AssetIssue = AssetWithIssueRelations["issues"][number];

function countActiveByseverity(
  issues: AssetIssue[],
  severity: Severity,
): number {
  return issues.filter(
    (i) =>
      i.status === IssueStatus.ACTIVE && i.vulnerability.severity === severity,
  ).length;
}

function totalActiveIssues(issues: AssetIssue[]): number {
  return issues.filter((i) => i.status === IssueStatus.ACTIVE).length;
}

const severityConfig = {
  [Severity.Critical]: {
    label: "Critical",
    short: "C",
    badgeClass: "bg-red-600 hover:bg-red-600 text-white",
  },
  [Severity.High]: {
    label: "High",
    short: "H",
    badgeClass: "bg-orange-500 hover:bg-orange-500 text-white",
  },
  [Severity.Medium]: {
    label: "Medium",
    short: "M",
    badgeClass: "bg-yellow-500 hover:bg-yellow-500 text-white",
  },
  [Severity.Low]: {
    label: "Low",
    short: "L",
    badgeClass: "bg-blue-500 hover:bg-blue-500 text-white",
  },
} as const;

function createSeverityColumn(
  severity: Severity,
  isFirst: boolean,
): ColumnDef<AssetWithIssueRelations> {
  const config = severityConfig[severity];
  return {
    id: `severity_${severity}`,
    header: () => (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="cursor-default font-medium">{config.short}</span>
          </TooltipTrigger>
          <TooltipContent>{config.label}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    ),
    cell: ({ row }) => {
      const issues = row.original.issues;
      const active = totalActiveIssues(issues);

      if (active === 0) {
        if (isFirst) {
          return (
            <Badge className="bg-green-600 hover:bg-green-600 text-white whitespace-nowrap">
              No active issues
            </Badge>
          );
        }
        return null;
      }

      const count = countActiveByseverity(issues, severity);
      if (count === 0) return <span className="text-muted-foreground">—</span>;
      return <Badge className={config.badgeClass}>{count}</Badge>;
    },
  };
}

function countUniqueRemediations(issues: AssetIssue[]): number {
  const ids = new Set<string>();
  for (const issue of issues) {
    if (issue.status === IssueStatus.ACTIVE) {
      ids.add(issue.vulnerabilityId);
    }
  }
  let total = 0;
  for (const issue of issues) {
    if (ids.has(issue.vulnerabilityId)) {
      total += issue.vulnerability._count.remediations;
      ids.delete(issue.vulnerabilityId);
    }
  }
  return total;
}

export const dashboardColumns: ColumnDef<AssetWithIssueRelations>[] = [
  {
    id: "role",
    accessorKey: "role",
    header: ({ column }) => <SortableHeader header="Role" column={column} />,
    cell: ({ row }) => (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="cursor-default">{row.original.role}</span>
          </TooltipTrigger>
          <TooltipContent>{row.original.deviceGroup.cpe}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    ),
  },
  {
    meta: { title: "IP Address" },
    accessorKey: "ip",
    header: "IP Address",
  },
  {
    accessorKey: "userId",
    meta: { title: "Source Tool" },
    header: "Source Tool",
    accessorFn: (row) => row.user.name,
  },
  createSeverityColumn(Severity.Critical, true),
  createSeverityColumn(Severity.High, false),
  createSeverityColumn(Severity.Medium, false),
  createSeverityColumn(Severity.Low, false),
  {
    id: "remediations",
    header: ({ column }) => (
      <SortableHeader header="Remediations Available" column={column} />
    ),
    cell: ({ row }) => {
      const count = countUniqueRemediations(row.original.issues);
      return (
        <Badge variant={count === 0 ? "destructive" : "secondary"}>
          {count === 0 ? "None" : count}
        </Badge>
      );
    },
  },
];

export const assetIssueColumns: ColumnDef<AssetIssue>[] = [
  {
    accessorKey: "id",
    header: "Issue ID",
    cell: ({ row }) => (
      <span className="font-mono text-sm">{row.original.id}</span>
    ),
  },
  {
    accessorKey: "vulnerability.cveId",
    header: "CVE ID",
    cell: ({ row }) => row.original.vulnerability.cveId || "—",
  },
  {
    accessorKey: "vulnerability.severity",
    header: "Severity",
    cell: ({ row }) => {
      const severity = row.original.vulnerability.severity;
      const config = severityConfig[severity];
      return <Badge className={config.badgeClass}>{config.label}</Badge>;
    },
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
            <Link href={`/vulnerabilities/${row.original.vulnerabilityId}`}>
              Go to Vulnerability
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
