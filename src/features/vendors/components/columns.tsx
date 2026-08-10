"use client";

import type { ColumnDef } from "@tanstack/react-table";
import type { VendorListItem } from "../types";

export const columns: ColumnDef<VendorListItem>[] = [
  {
    accessorKey: "canonicalName",
    meta: { title: "Vendor" },
    header: "Vendor",
  },
  {
    accessorKey: "assetCount",
    meta: { title: "Assets" },
    header: "Assets",
  },
];
