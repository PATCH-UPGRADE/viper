"use client";

import { Suspense, useMemo, useState } from "react";
import {
  EmptyView,
  EntitySearch,
  ErrorView,
  LoadingView,
} from "@/components/entity-components";
import { ReportingErrorBoundary } from "@/components/reporting-error-boundary";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
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
    <ToggleGroup
      type="single"
      value={value}
      // Radix emits "" when the selected chip is clicked again; keep the current filter.
      onValueChange={(next) => next && onChange(next as CategoryFilter)}
      aria-label="Filter by category"
      className="w-auto flex-wrap gap-2"
    >
      {chips.map((chip) => (
        <ToggleGroupItem
          key={chip.id}
          value={chip.id}
          className="group h-8 flex-none rounded-full border bg-background px-3 text-foreground first:rounded-full last:rounded-full hover:bg-accent hover:text-foreground data-[state=on]:border-foreground data-[state=on]:bg-foreground data-[state=on]:text-background"
        >
          {chip.label}
          <span className="text-xs tabular-nums text-muted-foreground group-data-[state=on]:text-background/70">
            {chip.count}
          </span>
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
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
        <EntitySearch
          value={query}
          onChange={setQuery}
          placeholder="Search configured and available integrations"
          label="Search integrations"
          clearable
        />
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
