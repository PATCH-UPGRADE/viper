"use client";

import { format } from "date-fns";
import {
  EntityContainer,
  ErrorView,
  LoadingView,
} from "@/components/entity-components";
import { SinceLastVisitCard } from "./since-last-visit-card";
import { SuggestedInboxCard } from "./suggested-inbox-card";
import { SuggestedWorkOrdersCard } from "./suggested-work-orders-card";

const greetingFor = (hour: number) => {
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
};

/**
 * The greeting and the date come from the viewer's clock, so the server HTML
 * can disagree with the first client render. `suppressHydrationWarning` lets
 * the client value replace it without a hydration warning.
 */
export const OverviewGreeting = ({ name }: { name: string }) => {
  const now = new Date();
  const firstName = name.trim().split(/\s+/)[0] || name;

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
  children: React.ReactNode;
}) => (
  <EntityContainer header={<OverviewGreeting name={name} />}>
    {children}
  </EntityContainer>
);

export const OverviewPanels = () => (
  <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-3">
    <div className="flex flex-col gap-6 lg:col-span-2">
      <SuggestedInboxCard />
      <SuggestedWorkOrdersCard />
    </div>
    <SinceLastVisitCard />
  </div>
);

export const OverviewLoading = () => (
  <LoadingView message="Loading overview..." />
);

export const OverviewError = () => (
  <ErrorView message="Error loading overview" />
);
