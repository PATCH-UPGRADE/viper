"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { formatDistanceToNow } from "date-fns";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { SortableHeader } from "@/components/ui/data-table";
import { MoreVerticalDropdownMenu } from "@/components/ui/dropdown-menu";
import { QuestionTooltip } from "@/components/ui/question-tooltip";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { getAssetTitle } from "@/features/assets/utils";
import { IssueStatusForm } from "@/features/issues/components/issue";
import type { VulnerabilityWithRelations } from "../types";
import {
  recordSources,
  summarizeMetrics,
  VULNERABILITY_SOURCE_LABELS,
} from "../utils";
import { VulnerabilitySources } from "./vulnerability-sources";

type Records = VulnerabilityWithRelations["records"];

const sourcesText = (records: Records) =>
  recordSources(records)
    .sources.map((source) => VULNERABILITY_SOURCE_LABELS[source])
    .join(", ");

/** "Unknown" when the KEV catalog was never checked for this vulnerability. */
const kevText = (records: Records) => {
  const kev = summarizeMetrics(records.flatMap((r) => r.metrics)).kev;
  if (kev?.inKev == null) return "Unknown";
  return kev.inKev ? "True" : "False";
};

// TODO: these sort headers do nothing. Sorting is manual, and getManyByPriorityInternal never
// reads `sort`: fetchPaginated always orders by createdAt. Sources and KEV are worked out from
// the records, so even with `sort` wired up, Prisma can't order by them without a stored column.
export const prioritizedColumns: ColumnDef<VulnerabilityWithRelations>[] = [
  {
    accessorKey: "id",
    header: ({ column }) => (
      <SortableHeader header="VIPER ID" column={column} />
    ),
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
    accessorKey: "displayId",
    header: ({ column }) => <SortableHeader header="ID" column={column} />,
    cell: ({ row }) => row.original.displayId,
  },
  {
    id: "sources",
    accessorFn: (row) => sourcesText(row.records),
    header: ({ column }) => <SortableHeader header="Sources" column={column} />,
    cell: ({ row }) => <VulnerabilitySources records={row.original.records} />,
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
    id: "kev",
    accessorFn: (row) => kevText(row.records),
    header: ({ column }) => (
      <div className="flex items-center gap-2">
        <SortableHeader header="In KEV?" column={column} />
        <QuestionTooltip>
          Known Exploited Vulnerabilities (KEV) - Vulnerabilities listed in
          CISA's catalog of exploits actively used in the wild
        </QuestionTooltip>
      </div>
    ),
    cell: ({ row }) => {
      const text = kevText(row.original.records);
      return (
        <Badge variant={text === "True" ? "destructive" : "outline"}>
          {text}
        </Badge>
      );
    },
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
    cell: ({ row }) =>
      row.original.asset ? getAssetTitle(row.original.asset) : "Device Group",
    // TODO: Consider a backend change where device group issues still get displayed
    // in the frontend as one issue per asset in that device group
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
      <MoreVerticalDropdownMenu
        items={[
          row.original.asset
            ? {
                label: "Go to Asset Details",
                href: `/assets/${row.original.asset.id}`,
              }
            : false,
          { label: "Go to Issue Details", href: `/issues/${row.original.id}` },
        ]}
      />
    ),
  },
];
