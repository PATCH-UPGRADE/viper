"use client";

import {
  BugIcon,
  ComputerIcon,
  InboxIcon,
  ListChecksIcon,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { mainPadding } from "@/config/constants";
import { SettingsSubheader } from "@/features/settings/components/settings-layout";
import { initialsOf } from "@/lib/string-utils";
import { cn } from "@/lib/utils";
import type { CatalogEntry } from "../core/catalog";
import { CATEGORIES, type Category } from "../types";
import { CreateIntegrationDialog } from "./create-integration-dialog";

// Which platforms show under which section is each platform's own call
// (`categories` on its ConnectorDefinition) — this is UI-only metadata for
// the sections themselves, not platform membership.
const SECTION_META: Record<Category, { icon: LucideIcon; subtitle: string }> = {
  "Hospital Inventory": {
    icon: ComputerIcon,
    subtitle: "Bring your asset inventory into VIPER.",
  },
  "Vulnerability Management Platforms": {
    icon: BugIcon,
    subtitle: "Import vulnerability data from scanners and advisory feeds.",
  },
  "Ticketing Platforms": {
    icon: ListChecksIcon,
    subtitle: "Route findings and work orders to your ticketing system.",
  },
  Notifications: {
    icon: InboxIcon,
    subtitle:
      "Get notified about new advisories, recalls, and platform events.",
  },
};

const PlatformCard = ({ entry }: { entry: CatalogEntry }) => (
  <Card className="p-0 gap-0 overflow-hidden">
    <div className="flex items-center gap-3 p-4">
      <Avatar className="size-9 shrink-0 rounded-md border">
        <AvatarFallback className="rounded-md bg-accent text-accent-foreground text-xs font-semibold">
          {initialsOf(entry.displayName)}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <CardTitle>{entry.displayName}</CardTitle>
        <CardDescription>{entry.description}</CardDescription>
      </div>
    </div>
    <div className="p-4 border-t">
      <CreateIntegrationDialog
        platform={entry.platform}
        displayName={entry.displayName}
        configFields={entry.configFields}
        credentialFields={entry.credentialFields}
        credentialsAreAuthShaped={entry.credentialsAreAuthShaped}
      />
    </div>
  </Card>
);

/** Scrollspy: highlights whichever section's top is closest to (but above) the viewport top. */
const useScrollSpy = (sections: readonly Category[]) => {
  const [active, setActive] = useState<Category>(sections[0]);
  const elements = useRef(new Map<Category, HTMLDivElement>());

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((entry) => entry.isIntersecting);
        if (visible.length === 0) return;
        const topmost = visible.reduce((a, b) =>
          a.boundingClientRect.top <= b.boundingClientRect.top ? a : b,
        );
        const section = topmost.target.getAttribute("data-section") as Category;
        setActive(section);
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

const CatalogSidebar = ({
  active,
  onSelect,
}: {
  active: Category;
  onSelect: (section: Category) => void;
}) => (
  <nav className="flex flex-col gap-1 w-56 shrink-0 sticky top-4 self-start">
    {CATEGORIES.map((name) => {
      const Icon = SECTION_META[name].icon;
      return (
        <button
          key={name}
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
        </button>
      );
    })}
  </nav>
);

const CategorySection = ({
  category,
  catalog,
}: {
  category: Category;
  catalog: CatalogEntry[];
}) => {
  const meta = SECTION_META[category];
  const entries = catalog.filter((entry) =>
    entry.categories.includes(category),
  );
  if (entries.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      <SettingsSubheader title={category} description={meta.subtitle} />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {entries.map((entry) => (
          <PlatformCard key={entry.platform} entry={entry} />
        ))}
      </div>
    </div>
  );
};

const IntegrationsCatalog = ({ catalog }: { catalog: CatalogEntry[] }) => {
  const { active, register, scrollTo } = useScrollSpy(CATEGORIES);

  return (
    <div className="flex gap-6">
      <CatalogSidebar active={active} onSelect={scrollTo} />
      <div className="flex flex-col gap-10 flex-1 min-w-0">
        {CATEGORIES.map((category) => (
          <div key={category} ref={register(category)} data-section={category}>
            <CategorySection category={category} catalog={catalog} />
          </div>
        ))}
        {/* Lets the last section scroll all the way to the top, like the others. */}
        <div className="min-h-[70vh]" aria-hidden="true" />
      </div>
    </div>
  );
};

export const IntegrationsCatalogContainer = ({
  catalog,
}: {
  catalog: CatalogEntry[];
}) => {
  return (
    <div className={cn(mainPadding, "flex flex-col gap-4")}>
      <SettingsSubheader
        title="Integrations"
        description="Manage external integrations to sync assets and vulnerabilities"
      />
      <IntegrationsCatalog catalog={catalog} />
    </div>
  );
};
