"use client";

import {
  ArchiveIcon,
  BellIcon,
  BugIcon,
  InboxIcon,
  type LucideIcon,
  WebhookIcon,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  EmptyView,
  ErrorView,
  LoadingView,
} from "@/components/entity-components";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { mainPadding } from "@/config/constants";
import { SettingsSubheader } from "@/features/settings/components/settings-layout";
import { useSuspenseWebhooks } from "@/features/webhooks/hooks/use-webhooks";
import { cn } from "@/lib/utils";
import type { CatalogEntry } from "../core/catalog";
import { useSuspenseIntegrations } from "../hooks/use-integrations";
import { CATEGORIES, type Category } from "../types";
import { IntegrationCard } from "./integration-row";
import { IntegrationsCatalog } from "./integrations-catalog";
import { enabledRowsFor, PlatformUploadsCard } from "./platform-uploads-row";

const SECTION_ICONS: Record<Category, LucideIcon> = {
  "Hospital Inventory": ArchiveIcon,
  "Vulnerability Management Platforms": BugIcon,
  "Ticketing Platforms": InboxIcon,
  Notifications: BellIcon,
};

/** Highlights whichever catalog section's top is closest to (but above) the viewport top. */
const useScrollSpy = () => {
  const [active, setActive] = useState<Category>(CATEGORIES[0]);
  const elements = useRef(new Map<Category, HTMLDivElement>());

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((entry) => entry.isIntersecting);
        if (visible.length === 0) return;
        const topmost = visible.reduce((a, b) =>
          a.boundingClientRect.top <= b.boundingClientRect.top ? a : b,
        );
        setActive(topmost.target.getAttribute("data-section") as Category);
      },
      { rootMargin: "-96px 0px -70% 0px", threshold: 0 },
    );
    for (const el of elements.current.values()) observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const register = (section: Category) => (el: HTMLDivElement | null) => {
    if (el) elements.current.set(section, el);
    else elements.current.delete(section);
  };

  const scrollTo = (section: Category) => {
    setActive(section);
    elements.current
      .get(section)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return { active, register, scrollTo };
};

const ConnectorsSidebar = ({
  catalog,
  active,
  onSelect,
}: {
  catalog: CatalogEntry[];
  active: Category;
  onSelect: (section: Category) => void;
}) => {
  const { data } = useSuspenseIntegrations();
  const { data: webhooks } = useSuspenseWebhooks();

  const countBySection = useMemo(() => {
    const counts = {} as Record<Category, number>;
    for (const row of enabledRowsFor(data.items, catalog)) {
      const categories =
        row.kind === "uploads"
          ? row.catalogEntry.categories
          : row.integration.categories;
      for (const category of categories) {
        counts[category] = (counts[category] ?? 0) + 1;
      }
    }
    return counts;
  }, [data.items, catalog]);

  return (
    <nav className="flex flex-col gap-1 w-56 shrink-0 sticky top-4 self-start">
      {CATEGORIES.map((name) => {
        const Icon = SECTION_ICONS[name];
        return (
          <button
            key={name}
            type="button"
            onClick={() => onSelect(name)}
            className={cn(
              "flex items-center gap-2 rounded-md px-3 py-2 text-sm text-left",
              active === name
                ? "bg-accent text-accent-foreground font-medium"
                : "text-muted-foreground hover:bg-accent/50",
            )}
          >
            <Icon className="size-4 shrink-0" />
            <span className="flex-1">{name}</span>
            <span className="text-xs tabular-nums">
              {countBySection[name] ?? 0}
            </span>
          </button>
        );
      })}
      <Separator className="my-1" />
      <Link
        href="/settings/webhooks"
        className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-accent/50"
      >
        <WebhookIcon className="size-4 shrink-0" />
        <span className="flex-1">Webhooks</span>
        <span className="text-xs tabular-nums">{webhooks.totalCount}</span>
      </Link>
    </nav>
  );
};

const EnabledIntegrations = ({ catalog }: { catalog: CatalogEntry[] }) => {
  const { data } = useSuspenseIntegrations();
  const rows = useMemo(
    () => enabledRowsFor(data.items, catalog),
    [data.items, catalog],
  );

  return (
    <div className="flex flex-col gap-4 flex-1 min-w-0">
      <SettingsSubheader
        title="Enabled Integrations"
        description="Currently active connections syncing data into VIPER."
      />
      {rows.length === 0 ? (
        <EmptyView message="No integrations enabled yet." />
      ) : (
        <Card className="p-0 gap-0 overflow-hidden divide-y">
          {rows.map((row) =>
            row.kind === "uploads" ? (
              <PlatformUploadsCard
                key={row.catalogEntry.platform}
                catalogEntry={row.catalogEntry}
                uploads={row.uploads}
              />
            ) : (
              <IntegrationCard
                key={row.integration.id}
                integration={row.integration}
                catalogEntry={row.catalogEntry}
              />
            ),
          )}
        </Card>
      )}
    </div>
  );
};

export const IntegrationsList = ({ catalog }: { catalog: CatalogEntry[] }) => {
  const { active, register, scrollTo } = useScrollSpy();

  return (
    <div className="flex gap-6">
      <ConnectorsSidebar
        catalog={catalog}
        active={active}
        onSelect={scrollTo}
      />
      <div className="flex flex-col gap-10 flex-1 min-w-0">
        <EnabledIntegrations catalog={catalog} />
        <IntegrationsCatalog catalog={catalog} register={register} />
      </div>
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
