"use client";

import { SearchIcon, XIcon } from "lucide-react";
import { Suspense, useMemo, useState } from "react";
import {
  EmptyView,
  ErrorView,
  LoadingView,
} from "@/components/entity-components";
import { ReportingErrorBoundary } from "@/components/reporting-error-boundary";
import { Input } from "@/components/ui/input";
import { mainPadding } from "@/config/constants";
import { SettingsSubheader } from "@/features/settings/components/settings-layout";
import { cn } from "@/lib/utils";
import type { CatalogEntry } from "../core/catalog";
import { useSuspenseIntegrations } from "../hooks/use-integrations";
import { CATEGORIES } from "../types";
import { ConfiguredIntegrationsTable } from "./configured-integrations";
import {
  type CategoryFilter,
  type ConfiguredRow,
  type ConnectorFilter,
  categoriesOf,
  configuredRowsFor,
  filterConfiguredRows,
  inCategory,
} from "./configured-rows";
import { IntegrationsCatalog } from "./integrations-catalog";
import { SuggestedIntegrations } from "./suggested-integrations";

const ConnectorSearch = ({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) => (
  <div className="relative w-full">
    <SearchIcon className="size-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
    <Input
      aria-label="Search integrations"
      className="bg-background shadow-none border-border pl-8 pr-8"
      placeholder="Search configured and available integrations"
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
    {value && (
      <button
        type="button"
        aria-label="Clear search"
        onClick={() => onChange("")}
        className="absolute right-2 top-1/2 flex size-5 -translate-y-1/2 items-center justify-center rounded text-muted-foreground hover:text-foreground"
      >
        <XIcon className="size-3.5" />
      </button>
    )}
  </div>
);

/** One chip per category, counting the configured rows in it. The counts ignore the search. */
const FilterChips = ({
  rows,
  value,
  onChange,
}: {
  rows: ConfiguredRow[];
  value: CategoryFilter;
  onChange: (value: CategoryFilter) => void;
}) => {
  const chips: { id: CategoryFilter; label: string; count: number }[] = [
    { id: "all", label: "All", count: rows.length },
    ...CATEGORIES.map((category) => ({
      id: category,
      label: category,
      count: rows.filter((row) => inCategory(categoriesOf(row), category))
        .length,
    })),
  ];

  return (
    <fieldset className="flex flex-wrap gap-2">
      <legend className="sr-only">Filter by category</legend>
      {chips.map((chip) => {
        const selected = value === chip.id;
        return (
          <button
            key={chip.id}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(chip.id)}
            className={cn(
              "inline-flex h-8 items-center gap-2 rounded-full border px-3 text-sm font-medium transition-colors",
              selected
                ? "border-foreground bg-foreground text-background"
                : "bg-background text-foreground hover:bg-accent",
            )}
          >
            {chip.label}
            <span
              className={cn(
                "text-xs tabular-nums",
                selected ? "text-background/70" : "text-muted-foreground",
              )}
            >
              {chip.count}
            </span>
          </button>
        );
      })}
    </fieldset>
  );
};

const ConfiguredIntegrations = ({
  rows,
  filter,
}: {
  rows: ConfiguredRow[];
  filter: ConnectorFilter;
}) => {
  const visible = useMemo(
    () => filterConfiguredRows(rows, filter),
    [rows, filter],
  );

  return (
    <section className="flex flex-col gap-3">
      <SettingsSubheader
        title="Configured integrations"
        description="Every connection set up for this hospital, including paused ones."
      />
      {visible.length > 0 ? (
        <ConfiguredIntegrationsTable rows={visible} />
      ) : (
        <EmptyView
          message={
            rows.length === 0
              ? "No integrations configured yet."
              : "No configured integrations match."
          }
        />
      )}
    </section>
  );
};

export const IntegrationsList = ({ catalog }: { catalog: CatalogEntry[] }) => {
  const { data } = useSuspenseIntegrations();
  const rows = useMemo(
    () => configuredRowsFor(data.items, catalog),
    [data.items, catalog],
  );
  const [category, setCategory] = useState<CategoryFilter>("all");
  const [query, setQuery] = useState("");
  const filter = useMemo(() => ({ category, query }), [category, query]);

  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-col gap-3">
        <ConnectorSearch value={query} onChange={setQuery} />
        <FilterChips rows={rows} value={category} onChange={setCategory} />
      </div>
      <ConfiguredIntegrations rows={rows} filter={filter} />
      {/* Suggestions are optional: if they fail or load slowly, the rest of the page still renders. */}
      <ReportingErrorBoundary fallback={null}>
        <Suspense fallback={null}>
          <SuggestedIntegrations catalog={catalog} filter={filter} />
        </Suspense>
      </ReportingErrorBoundary>
      <IntegrationsCatalog catalog={catalog} filter={filter} />
    </div>
  );
};

export const IntegrationsContainer = ({
  children,
}: {
  children: React.ReactNode;
}) => (
  <div className={cn(mainPadding, "flex flex-col gap-4")}>
    <SettingsSubheader
      title="Connectors"
      description="Connect Viper to the systems your hospital already runs — inventory, vulnerability feeds, ticketing, and notifications."
    />
    {children}
  </div>
);

export const IntegrationsLoading = () => (
  <LoadingView message="Loading integrations..." />
);

export const IntegrationsError = () => (
  <ErrorView message="Error loading integrations" />
);
