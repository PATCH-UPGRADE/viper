import type { ColumnDef } from "@tanstack/table-core";
import { SortableHeader } from "@/components/ui/data-table";
import { resolveUpstreamApi } from "@/features/integrations/core/urls";
import { relativeTime } from "@/lib/date-utils";
import type { RemediationResponse } from "../types";

export const columns: ColumnDef<RemediationResponse>[] = [
  {
    accessorKey: "description",
    meta: { title: "Description" },
    header: "Description",
  },
  {
    accessorKey: "upstreamApi",
    meta: { title: "Upstream API" },
    header: "Upstream API",
    accessorFn: (row) => resolveUpstreamApi(row.externalMappings) ?? "",
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
    cell: ({ row }) => relativeTime(row.original.updatedAt),
  },
];
