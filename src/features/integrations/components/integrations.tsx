"use client";

import { LayoutGridIcon, type LucideIcon, WebhookIcon } from "lucide-react";
import { Fragment, useEffect, useState } from "react";
import {
  EmptyView,
  ErrorView,
  LoadingView,
} from "@/components/entity-components";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { mainPadding } from "@/config/constants";
import { SettingsSubheader } from "@/features/settings/components/settings-layout";
import {
  AddWebhookButton,
  WebhooksList,
} from "@/features/webhooks/components/webhooks";
import { useSuspenseWebhooks } from "@/features/webhooks/hooks/use-webhooks";
import { cn } from "@/lib/utils";
import type { CatalogEntry } from "../core/catalog";
import { useSuspenseIntegrations } from "../hooks/use-integrations";
import { CATEGORIES, type IntegrationListItem } from "../types";
import { IntegrationCard } from "./integration-row";
import { CategoryCatalog, SECTION_META } from "./integrations-catalog";

const SECTIONS = ["Overview", ...CATEGORIES, "Webhooks"] as const;
type Section = (typeof SECTIONS)[number];

const iconFor = (section: Section): LucideIcon => {
  if (section === "Overview") return LayoutGridIcon;
  if (section === "Webhooks") return WebhookIcon;
  return SECTION_META[section].icon;
};

const ConnectorsSidebar = ({
  active,
  integrations,
  onSelect,
  webhookCount,
}: {
  active: Section;
  integrations: IntegrationListItem[];
  onSelect: (section: Section) => void;
  webhookCount: number;
}) => {
  return (
    <nav className="flex flex-col gap-1 w-56 shrink-0 sticky top-4 self-start">
      {SECTIONS.map((name) => {
        const Icon = iconFor(name);
        const count =
          name === "Overview"
            ? integrations.length
            : name === "Webhooks"
              ? webhookCount
              : integrations.filter((item) => item.categories.includes(name))
                  .length;
        return (
          <Fragment key={name}>
            {name === "Webhooks" && <Separator className="my-1" />}
            <button
              type="button"
              onClick={() => onSelect(name)}
              className={cn(
                "flex items-center gap-2 rounded-md px-3 py-2 text-sm text-left",
                active === name
                  ? "bg-accent text-primary font-semibold"
                  : "text-muted-foreground hover:bg-accent/50",
              )}
            >
              <Icon className="size-4 shrink-0" />
              <span className="flex-1">{name}</span>
              <span className="text-xs tabular-nums">{count}</span>
            </button>
          </Fragment>
        );
      })}
    </nav>
  );
};

/** Scrollspy: highlights whichever section's top is closest to (but above) the viewport top. */
const useScrollSpy = () => {
  const [active, setActive] = useState<Section>("Overview");

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((entry) => entry.isIntersecting);
        if (visible.length === 0) return;
        const topmost = visible.reduce((a, b) =>
          a.boundingClientRect.top <= b.boundingClientRect.top ? a : b,
        );
        setActive(topmost.target.getAttribute("data-section") as Section);
      },
      { rootMargin: "-96px 0px -70% 0px" },
    );
    for (const element of document.querySelectorAll("[data-section]")) {
      observer.observe(element);
    }
    return () => observer.disconnect();
  }, []);

  const scrollTo = (section: Section) => {
    setActive(section);
    document
      .querySelector(`[data-section="${section}"]`)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return { active, scrollTo };
};

export const IntegrationsList = ({ catalog }: { catalog: CatalogEntry[] }) => {
  const { data } = useSuspenseIntegrations();
  const { data: webhooks } = useSuspenseWebhooks();
  const { active, scrollTo } = useScrollSpy();

  return (
    <div className="flex gap-6">
      <ConnectorsSidebar
        active={active}
        integrations={data.items}
        onSelect={scrollTo}
        webhookCount={webhooks.totalCount}
      />
      <div className="flex flex-col gap-10 flex-1 min-w-0">
        <div className="flex flex-col gap-4" data-section="Overview">
          <SettingsSubheader
            title="Enabled Integrations"
            description="Currently active connections syncing data into VIPER."
          />
          {data.items.length === 0 ? (
            <EmptyView message="No enabled integrations yet." />
          ) : (
            <Card className="p-0 gap-0 overflow-hidden divide-y">
              {data.items.map((integration) => (
                <IntegrationCard
                  key={integration.id}
                  integration={integration}
                />
              ))}
            </Card>
          )}
        </div>
        {CATEGORIES.map((category) => (
          <div key={category} data-section={category}>
            <CategoryCatalog
              category={category}
              catalog={catalog}
              integrations={data.items}
            />
          </div>
        ))}
        <div data-section="Webhooks">
          <div className="flex flex-col gap-4">
            <div className="flex items-start justify-between">
              <SettingsSubheader
                title="Webhooks"
                description="Send VIPER events to your own endpoints."
              />
              <AddWebhookButton />
            </div>
            <WebhooksList search={false} />
          </div>
        </div>
        {/* Lets the last section scroll all the way to the top, like the others. */}
        <div className="min-h-[70vh]" aria-hidden="true" />
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
