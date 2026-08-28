"use client";

import { EyeIcon, EyeOffIcon, PencilIcon, SlashIcon } from "lucide-react";
import { parseAsStringLiteral, useQueryState } from "nuqs";
import { useEffect, useState } from "react";
import {
  EntityContainer,
  ErrorView,
  LoadingView,
} from "@/components/entity-components";
import { Badge } from "@/components/ui/badge";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BriefingPanel } from "@/features/mitigation/components/briefing-panel";
import { CategoryColorProvider } from "@/features/tag-colors/context";
import {
  useMarkTicketSeen,
  useSetWatching,
  useSuspenseTrackingTicket,
} from "../../hooks/use-tracking";
import { ActivityTimeline } from "./activity-timeline";
import { AdditionalDetailsCard } from "./additional-details-card";
import { DescriptionCard } from "./description-card";
import { TicketEditForm } from "./edit-form";
import { LinkedAssetsTabContent } from "./linked-assets";
import { OverviewCard } from "./overview-card";
import { RawJsonListCard } from "./raw-json-list-card";
import { RelatedWorkOrdersSection } from "./related-work-orders";
import { SubTicketsSection } from "./sub-tickets";

// Re-exports so existing import sites (`./ticket-detail`) keep working.
export { AddCommentForm } from "./add-comment-form";
export { DepartmentMultiSelect } from "./department-multi-select";
export { TicketEditForm } from "./edit-form";
export { LinkedAssetsTable } from "./linked-assets-table";

const TAB_VALUES = [
  "details",
  "briefing",
  "assets",
  "remediations",
  "vulnerabilities",
] as const;

const TabCount = ({ n }: { n: number }) => (
  <Badge
    variant="secondary"
    className="ml-1.5 h-5 min-w-5 justify-center rounded-full px-1.5 text-xs font-semibold"
  >
    {n}
  </Badge>
);

export const TicketDetailContent = ({ id }: { id: string }) => {
  const { data } = useSuspenseTrackingTicket(id);
  const [isEditing, setIsEditing] = useState(false);
  const setWatching = useSetWatching();
  const { mutate: markSeen } = useMarkTicketSeen();
  const [tab, setTab] = useQueryState(
    "tab",
    parseAsStringLiteral(TAB_VALUES).withDefault("details"),
  );

  // Viewing a ticket marks its comments as seen for the current user, clearing
  // the unread-comments indicator. Upserts on (userId, ticketId) per mount.
  useEffect(() => {
    markSeen({ ticketId: id });
  }, [id, markSeen]);

  // A stale/shared ?tab=briefing URL for a ticket with no plan would otherwise
  // select a tab with no matching trigger or content — a blank panel.
  useEffect(() => {
    if (tab === "briefing" && !data.mitigationPlanId) setTab("details");
  }, [tab, data.mitigationPlanId, setTab]);

  return (
    <EntityContainer
      header={
        <div className="flex flex-col gap-3">
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink href="/tracking">Work Orders</BreadcrumbLink>
              </BreadcrumbItem>
              {data.parent && (
                <>
                  <BreadcrumbSeparator>
                    <SlashIcon className="size-3" />
                  </BreadcrumbSeparator>
                  <BreadcrumbItem>
                    <BreadcrumbLink href={`/tracking/${data.parent.id}`}>
                      {data.parent.summary}
                    </BreadcrumbLink>
                  </BreadcrumbItem>
                </>
              )}
              <BreadcrumbSeparator>
                <SlashIcon className="size-3" />
              </BreadcrumbSeparator>
              <BreadcrumbItem>
                <BreadcrumbPage className="max-w-md truncate">
                  {data.summary}
                </BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>

          <div className="flex items-start gap-3">
            <h1 className="min-w-0 flex-1 text-xl font-semibold md:text-2xl">
              {data.summary}
            </h1>
            {!isEditing && (
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className={
                    data.isWatching
                      ? "border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100 hover:text-amber-800 dark:border-amber-700/60 dark:bg-amber-950/40 dark:text-amber-400 dark:hover:bg-amber-950/60"
                      : undefined
                  }
                  disabled={setWatching.isPending}
                  aria-pressed={data.isWatching}
                  onClick={() =>
                    setWatching.mutate({
                      ticketId: id,
                      watching: !data.isWatching,
                    })
                  }
                >
                  {data.isWatching ? (
                    <EyeIcon className="size-3.5" />
                  ) : (
                    <EyeOffIcon className="size-3.5" />
                  )}
                  {data.isWatching ? "Watching" : "Watch"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setIsEditing(true)}
                >
                  <PencilIcon className="size-3.5" />
                  Edit
                </Button>
              </div>
            )}
          </div>
        </div>
      }
    >
      {isEditing ? (
        <TicketEditForm data={data} onCancel={() => setIsEditing(false)} />
      ) : (
        <Tabs
          value={tab}
          onValueChange={(v) => setTab(v as (typeof TAB_VALUES)[number])}
        >
          <TabsList variant="line-primary">
            <TabsTrigger value="details">Details</TabsTrigger>
            {data.mitigationPlanId && (
              <TabsTrigger value="briefing">Briefing</TabsTrigger>
            )}
            <TabsTrigger value="assets">
              Assets
              <TabCount n={data.assets.length} />
            </TabsTrigger>
            <TabsTrigger value="remediations">
              Remediations
              <TabCount n={data.remediations.length} />
            </TabsTrigger>
            <TabsTrigger value="vulnerabilities">
              Vulnerabilities
              <TabCount n={data.vulnerabilities.length} />
            </TabsTrigger>
          </TabsList>

          <TabsContent value="details" className="mt-4 flex flex-col gap-4">
            <OverviewCard data={data} />
            <DescriptionCard data={data} />
            {data.mitigationPlan && (
              <RelatedWorkOrdersSection
                ticketId={data.id}
                siblings={data.mitigationPlan.workOrders}
              />
            )}
            <SubTicketsSection
              parentId={data.id}
              childTickets={data.children}
            />
            <AdditionalDetailsCard
              assetIds={data.assets.map((a) => a.asset.id)}
            />
            <ActivityTimeline
              ticketId={data.id}
              comments={data.comments}
              activities={data.activities}
            />
          </TabsContent>

          {data.mitigationPlanId && (
            <TabsContent value="briefing" className="mt-4">
              <BriefingPanel
                planId={data.mitigationPlanId}
                title={data.summary}
              />
            </TabsContent>
          )}

          <TabsContent value="assets" className="mt-4">
            <LinkedAssetsTabContent
              ticketId={data.id}
              assetTickets={data.assets}
            />
          </TabsContent>

          <TabsContent value="remediations" className="mt-4">
            <RawJsonListCard
              items={data.remediations}
              emptyMessage="No remediations linked to this work order."
            />
          </TabsContent>

          <TabsContent value="vulnerabilities" className="mt-4">
            <RawJsonListCard
              items={data.vulnerabilities}
              emptyMessage="No vulnerabilities linked to this work order."
            />
          </TabsContent>
        </Tabs>
      )}
    </EntityContainer>
  );
};

export const TicketDetailPage = ({ id }: { id: string }) => {
  return (
    <CategoryColorProvider>
      <TicketDetailContent id={id} />
    </CategoryColorProvider>
  );
};

export const TicketDetailLoading = () => (
  <LoadingView message="Loading ticket..." />
);
export const TicketDetailError = () => (
  <ErrorView message="Error loading ticket" />
);
