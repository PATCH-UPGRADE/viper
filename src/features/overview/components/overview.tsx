"use client";

import { format } from "date-fns";
import { type ReactNode, useEffect, useState } from "react";
import {
  EntityContainer,
  ErrorView,
  LoadingView,
} from "@/components/entity-components";
import { DebriefCard } from "@/features/debrief/components/debrief-card";
import { firstNameOf } from "@/lib/utils";
import { RecentUpdatesCard } from "./recent-updates-card";
import { SuggestedInboxCard } from "./suggested-inbox-card";
import { SuggestedWorkOrdersCard } from "./suggested-work-orders-card";

const greetingFor = (hour: number) => {
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
};

/**
 * The greeting and the date come from the viewer's clock, so the server HTML
 * can disagree with the first client render. `suppressHydrationWarning` hides
 * that mismatch, but it also stops React from patching the server text. The
 * effect writes the viewer's clock after mount, which does replace it.
 */
export const OverviewGreeting = ({ name }: { name: string }) => {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    setNow(new Date());
  }, []);
  const firstName = firstNameOf(name) ?? name;

  return (
    <div className="flex flex-col gap-1">
      <h1
        className="text-2xl font-semibold tracking-tight"
        suppressHydrationWarning
      >
        {greetingFor(now.getHours())}, {firstName}
      </h1>
      <p className="text-sm text-muted-foreground" suppressHydrationWarning>
        {format(now, "EEEE, MMMM d, yyyy")}
      </p>
    </div>
  );
};

export const OverviewContainer = ({
  name,
  children,
}: {
  name: string;
  children: ReactNode;
}) => (
  <EntityContainer header={<OverviewGreeting name={name} />}>
    {children}
  </EntityContainer>
);

export const OverviewPanels = () => (
  <div className="flex flex-col gap-6">
    <DebriefCard />
    <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-3">
      <div className="flex flex-col gap-6 lg:col-span-2">
        <SuggestedInboxCard />
        <SuggestedWorkOrdersCard />
      </div>
      <RecentUpdatesCard />
    </div>
  </div>
);

export const OverviewLoading = () => (
  <LoadingView message="Loading overview..." />
);

export const OverviewError = () => (
  <ErrorView message="Error loading overview" />
);
