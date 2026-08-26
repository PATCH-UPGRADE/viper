"use client";

import {
  ArchiveIcon,
  BellIcon,
  BugIcon,
  InboxIcon,
  LayoutGridIcon,
  type LucideIcon,
  WebhookIcon,
} from "lucide-react";
import Link from "next/link";
import { parseAsStringLiteral, useQueryState } from "nuqs";
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
import { CATEGORIES } from "../types";
import { IntegrationCard } from "./integration-row";
import { IntegrationsCatalog } from "./integrations-catalog";

const SECTIONS = ["Overview", ...CATEGORIES] as const;
type Section = (typeof SECTIONS)[number];

const SECTION_ICONS: Record<Section, LucideIcon> = {
  Overview: LayoutGridIcon,
  "Hospital Inventory": ArchiveIcon,
  "Vulnerability Management Platforms": BugIcon,
  "Ticketing Platforms": InboxIcon,
  Notifications: BellIcon,
};

const useSection = () =>
  useQueryState(
    "section",
    parseAsStringLiteral(SECTIONS).withDefault("Overview"),
  );

const ConnectorsSidebar = () => {
  const { data } = useSuspenseIntegrations();
  const { data: webhooks } = useSuspenseWebhooks();
  const [section, setSection] = useSection();

  const countBySection = data.items.reduce(
    (counts, item) => {
      for (const category of item.categories) {
        counts[category] = (counts[category] ?? 0) + 1;
      }
      return counts;
    },
    { Overview: data.items.length } as Record<Section, number>,
  );

  return (
    <nav className="flex flex-col gap-1 w-56 shrink-0">
      {SECTIONS.map((name) => {
        const Icon = SECTION_ICONS[name];
        return (
          <button
            key={name}
            type="button"
            onClick={() => setSection(name)}
            className={cn(
              "flex items-center gap-2 rounded-md px-3 py-2 text-sm text-left",
              section === name
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

const EnabledIntegrations = () => {
  const { data } = useSuspenseIntegrations();
  const [section] = useSection();

  const items =
    section === "Overview"
      ? data.items
      : data.items.filter((i) => i.categories.includes(section));

  return (
    <div className="flex flex-col gap-4 flex-1 min-w-0">
      <SettingsSubheader
        title="Enabled Integrations"
        description="Currently active connections syncing data into VIPER."
      />
      {items.length === 0 ? (
        <EmptyView message={`No enabled integrations in ${section}.`} />
      ) : (
        <Card className="p-0 gap-0 overflow-hidden divide-y">
          {items.map((integration) => (
            <IntegrationCard key={integration.id} integration={integration} />
          ))}
        </Card>
      )}
    </div>
  );
};

export const IntegrationsList = ({ catalog }: { catalog: CatalogEntry[] }) => {
  const [section] = useSection();
  const category = section === "Overview" ? undefined : section;

  return (
    <div className="flex gap-6">
      <ConnectorsSidebar />
      <div className="flex flex-col gap-10 flex-1 min-w-0">
        <EnabledIntegrations />
        <IntegrationsCatalog catalog={catalog} category={category} />
      </div>
    </div>
  );
};

export const IntegrationsContainer = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  return (
    <div className={cn(mainPadding, "flex flex-col gap-4")}>
      <SettingsSubheader
        title="Connectors"
        description="Connect Viper to the systems your hospital already runs — inventory, vulnerability feeds, ticketing, and notifications."
      />
      {children}
    </div>
  );
};

export const IntegrationsLoading = () => {
  return <LoadingView message="Loading integrations..." />;
};

export const IntegrationsError = () => {
  return <ErrorView message="Error loading integrations" />;
};
