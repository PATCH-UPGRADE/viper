"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { useRouter } from "next/navigation";
import {
  EntityContainer,
  EntityHeader,
  EntitySearch,
  ErrorView,
  LoadingView,
} from "@/components/entity-components";
import { DataTable } from "@/components/ui/data-table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CategoryColorProvider } from "@/features/tag-colors/context";
import { useEntitySearch } from "@/hooks/use-entity-search";
import { useSuspenseTrackingTickets } from "../hooks/use-tracking";
import { useTrackingParams } from "../hooks/use-tracking-params";
import { TRACKING_TABS, type TrackingTab } from "../params";
import type { TrackingTicketChildRow, TrackingTicketRow } from "../types";
import { trackingColumns } from "./columns";

const tabLabels: Record<TrackingTab, string> = {
  suggested: "Suggested",
  "my-department": "My Department",
  "requires-approval": "Requires Approval",
  all: "All",
};

export const TrackingSearch = () => {
  const [params, setParams] = useTrackingParams();
  const { searchValue, onSearchChange } = useEntitySearch({
    params,
    setParams,
  });

  return (
    <EntitySearch
      value={searchValue}
      onChange={onSearchChange}
      placeholder="Search tickets"
    />
  );
};

export const TrackingTabsNav = () => {
  const [{ tab }, setParams] = useTrackingParams();

  return (
    <Tabs
      value={tab}
      onValueChange={(value) =>
        setParams({ tab: value as TrackingTab, page: 1 })
      }
    >
      <TabsList variant="line">
        {TRACKING_TABS.map((value) => (
          <TabsTrigger key={value} value={value}>
            <span className="font-semibold">{tabLabels[value]}</span>
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
};

export const TrackingList = () => {
  const { data, isFetching } = useSuspenseTrackingTickets();
  const router = useRouter();

  return (
    <CategoryColorProvider>
      <div className="flex flex-col gap-4">
        <TrackingTabsNav />
        <DataTable<TrackingTicketRow, unknown, TrackingTicketChildRow, unknown>
          paginatedData={data}
          columns={trackingColumns as ColumnDef<TrackingTicketRow>[]}
          nestedColumns={trackingColumns}
          nestedDataKey="children"
          inlineNestedRows
          isLoading={isFetching}
          search={<TrackingSearch />}
          rowOnclick={(row) => {
            // Parents with sub-tickets expand on first click; a second click
            // (or any click on a leaf parent / child row) opens the detail.
            if (row.depth === 0 && row.getCanExpand() && !row.getIsExpanded()) {
              row.toggleExpanded();
              return;
            }
            router.push(`/tracking/${row.original.id}`);
          }}
        />
      </div>
    </CategoryColorProvider>
  );
};

export const TrackingHeader = () => {
  return (
    <EntityHeader
      title="Tracking"
      description="Work order tickets and approval gates for in-flight remediations."
    />
  );
};

export const TrackingContainer = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  return (
    <EntityContainer header={<TrackingHeader />}>{children}</EntityContainer>
  );
};

export const TrackingLoading = () => {
  return <LoadingView message="Loading tickets..." />;
};

export const TrackingError = () => {
  return <ErrorView message="Error loading tickets" />;
};
