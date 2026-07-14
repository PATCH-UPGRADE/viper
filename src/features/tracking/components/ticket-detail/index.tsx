"use client";

import {
  CalendarIcon,
  ClockIcon,
  EyeIcon,
  EyeOffIcon,
  PencilIcon,
  SlashIcon,
  UserIcon,
} from "lucide-react";
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
import { CategoryColorProvider } from "@/features/tag-colors/context";
import { getChipClass } from "@/features/tag-colors/palette";
import {
  useMarkTicketSeen,
  useSetWatching,
  useSuspenseTrackingTicket,
} from "../../hooks/use-tracking";
import { ActivityTimeline } from "./activity-timeline";
import { TicketEditForm } from "./edit-form";
import { LinkedAssetsTabContent } from "./linked-assets";
import {
  CategoryChip,
  formatDate,
  formatScheduled,
  MetadataRow,
  Section,
  statusHue,
  statusLabels,
} from "./shared";
import { SubTicketsSection } from "./sub-tickets";

// Re-exports so existing import sites (`./ticket-detail`) keep working.
export { AddCommentForm } from "./add-comment-form";
export { DepartmentMultiSelect } from "./department-multi-select";
export { TicketEditForm } from "./edit-form";
export { LinkedAssetsTable } from "./linked-assets-table";

export const TicketDetailContent = ({ id }: { id: string }) => {
  const { data } = useSuspenseTrackingTicket(id);
  const [isEditing, setIsEditing] = useState(false);
  const setWatching = useSetWatching();
  const { mutate: markSeen } = useMarkTicketSeen();

  // Viewing a ticket marks its comments as seen for the current user, clearing
  // the unread-comments indicator. Upserts on (userId, ticketId) per mount.
  useEffect(() => {
    markSeen({ ticketId: id });
  }, [id, markSeen]);

  return (
    <EntityContainer
      header={
        <div className="flex flex-col gap-3">
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink href="/tracking">Tracking</BreadcrumbLink>
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
            <h1 className="text-xl md:text-2xl font-semibold flex-1 min-w-0">
              {data.summary}
            </h1>
            {!isEditing && (
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant={data.isWatching ? "secondary" : "outline"}
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
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6 rounded-lg border bg-background p-4">
            <MetadataRow label="Assignee">
              <div className="flex items-center gap-1.5 text-sm">
                <UserIcon className="size-3.5 text-muted-foreground" />
                {data.assignee?.name ?? "Unassigned"}
              </div>
            </MetadataRow>
            <MetadataRow label="Departments">
              {data.departments.length > 0 ? (
                <div className="flex flex-wrap gap-1">
                  {data.departments.map((d) => (
                    <Badge
                      key={d.id}
                      variant="outline"
                      className={getChipClass(d.color)}
                    >
                      {d.name}
                    </Badge>
                  ))}
                </div>
              ) : (
                <span className="text-sm text-muted-foreground">—</span>
              )}
            </MetadataRow>
            <MetadataRow label="Scheduled for">
              <div className="flex items-center gap-1.5 text-sm">
                <CalendarIcon className="size-3.5 text-muted-foreground" />
                {formatScheduled(data.scheduledAt) ?? "—"}
              </div>
            </MetadataRow>
            <MetadataRow label="Created">
              <div className="flex items-center gap-1.5 text-sm">
                <ClockIcon className="size-3.5 text-muted-foreground" />
                {formatDate(data.createdAt)}
              </div>
            </MetadataRow>
            <MetadataRow label="Category">
              <CategoryChip category={data.category} />
            </MetadataRow>
            <MetadataRow label="Status">
              <Badge
                variant="outline"
                className={getChipClass(statusHue[data.status])}
              >
                {statusLabels[data.status]}
              </Badge>
            </MetadataRow>
          </div>

          {data.descriptions.length > 0 && (
            <div className="rounded-lg border bg-background p-4">
              <Section title="Descriptions">
                <Tabs defaultValue={data.descriptions[0].department.id}>
                  <TabsList variant="line">
                    {data.descriptions.map((d) => (
                      <TabsTrigger key={d.id} value={d.department.id}>
                        <Badge
                          variant="outline"
                          className={getChipClass(d.department.color)}
                        >
                          {d.department.name}
                        </Badge>
                      </TabsTrigger>
                    ))}
                  </TabsList>
                  {data.descriptions.map((d) => (
                    <TabsContent
                      key={d.id}
                      value={d.department.id}
                      className="mt-4"
                    >
                      <p className="text-sm whitespace-pre-wrap">{d.body}</p>
                    </TabsContent>
                  ))}
                </Tabs>
              </Section>
            </div>
          )}
        </>
      )}

      <SubTicketsSection parentId={data.id} childTickets={data.children} />

      <div className="rounded-lg border bg-background p-4">
        <Tabs defaultValue="assets">
          <TabsList variant="line">
            <TabsTrigger value="assets">
              <span className="font-semibold">
                Linked Assets ({data.assets.length})
              </span>
            </TabsTrigger>
            <TabsTrigger value="files">
              <span className="font-semibold">Linked Files (0)</span>
            </TabsTrigger>
          </TabsList>
          <TabsContent value="assets" className="mt-4">
            <LinkedAssetsTabContent
              ticketId={data.id}
              assets={data.assets}
              remediations={data.remediations}
            />
          </TabsContent>
          <TabsContent value="files" className="mt-4">
            <p className="text-sm text-muted-foreground">
              No files linked to this ticket.
            </p>
          </TabsContent>
        </Tabs>
      </div>

      <ActivityTimeline
        ticketId={data.id}
        comments={data.comments}
        activities={data.activities}
      />
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
