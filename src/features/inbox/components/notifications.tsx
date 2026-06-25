"use client";

import { ChevronDownIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  EntityContainer,
  EntityHeader,
  EntitySearch,
  ErrorView,
  LoadingView,
} from "@/components/entity-components";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DataTable } from "@/components/ui/data-table";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { NotificationType, Priority } from "@/generated/prisma";
import { useEntitySearch } from "@/hooks/use-entity-search";
import {
  useMarkNotificationRead,
  useSuspenseNotifications,
} from "../hooks/use-notifications";
import { useNotificationsParams } from "../hooks/use-notifications-params";
import { notificationColumns } from "./columns";

// ---------------------------------------------------------------------------
// Generic multi-select filter
// ---------------------------------------------------------------------------

function MultiSelectFilter<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T[];
  onChange: (value: T[]) => void;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5 bg-background">
          {label}
          {value.length > 0 && (
            <Badge variant="secondary" className="text-xs px-1.5">
              {value.length}
            </Badge>
          )}
          <ChevronDownIcon className="size-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-44 p-1" align="end">
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-muted cursor-pointer"
            onClick={() => {
              const next = value.includes(opt.value)
                ? value.filter((v) => v !== opt.value)
                : [...value, opt.value];
              onChange(next);
            }}
          >
            <Checkbox checked={value.includes(opt.value)} />
            {opt.label}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

// ---------------------------------------------------------------------------
// Filter controls
// ---------------------------------------------------------------------------

const PRIORITY_OPTIONS = Object.values(Priority).map((p) => ({
  value: p,
  label: p,
}));

const TYPE_OPTIONS = Object.values(NotificationType).map((t) => ({
  value: t,
  label: t === "UpdateAvailable" ? "New Update" : t,
}));

export const NotificationsFilters = () => {
  const [params, setParams] = useNotificationsParams();

  return (
    <div className="flex items-center gap-2 ml-auto shrink-0">
      <MultiSelectFilter
        label="Priority"
        options={PRIORITY_OPTIONS}
        value={params.priority}
        onChange={(priority) =>
          setParams((prev) => ({ ...prev, priority, page: 1 }))
        }
      />
      <MultiSelectFilter
        label="Type"
        options={TYPE_OPTIONS}
        value={params.type}
        onChange={(type) => setParams((prev) => ({ ...prev, type, page: 1 }))}
      />
    </div>
  );
};

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

export const NotificationsSearch = () => {
  const [params, setParams] = useNotificationsParams();
  const { searchValue, onSearchChange } = useEntitySearch({
    params,
    setParams: (updated) => setParams(updated),
  });

  return (
    <EntitySearch
      value={searchValue}
      onChange={onSearchChange}
      placeholder="Search notifications"
    />
  );
};

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------

export const NotificationsList = () => {
  const { data, isFetching } = useSuspenseNotifications();
  const router = useRouter();
  const markRead = useMarkNotificationRead();

  return (
    <DataTable
      paginatedData={data}
      columns={notificationColumns}
      isLoading={isFetching}
      search={
        <div className="flex items-center gap-2 flex-1">
          <NotificationsSearch />
          <NotificationsFilters />
        </div>
      }
      rowOnclick={(row) => {
        markRead.mutate({ notificationId: row.original.id });
        router.push(`/inbox/${row.original.id}`);
      }}
    />
  );
};

// ---------------------------------------------------------------------------
// Page scaffold
// ---------------------------------------------------------------------------

export const NotificationsHeader = () => (
  <EntityHeader
    title="Inbox"
    description="Security notifications for your hospital assets"
  />
);

export const NotificationsContainer = ({
  children,
}: {
  children: React.ReactNode;
}) => (
  <EntityContainer header={<NotificationsHeader />}>{children}</EntityContainer>
);

export const NotificationsLoading = () => (
  <LoadingView message="Loading notifications..." />
);

export const NotificationsError = () => (
  <ErrorView message="Error loading notifications" />
);
