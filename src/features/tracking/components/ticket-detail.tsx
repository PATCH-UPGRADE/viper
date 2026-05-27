"use client";

import { format } from "date-fns";
import {
  CalendarIcon,
  ClockIcon,
  HeartPulseIcon,
  MessageSquareIcon,
  SlashIcon,
  UserIcon,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import {
  EntityContainer,
  ErrorView,
  LoadingView,
} from "@/components/entity-components";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { UserAvatar } from "@/components/user-avatar";
import { authClient } from "@/lib/auth-client";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { SeverityBadge } from "@/components/severity-badge";
import {
  TicketCategory,
  TicketSource,
  TicketStatus,
} from "@/generated/prisma";
import {
  CategoryColorProvider,
  useCategoryColor,
} from "@/features/tag-colors/context";
import { getChipClass } from "@/features/tag-colors/palette";
import {
  useAddTicketComment,
  useSuspenseTrackingTicket,
} from "../hooks/use-tracking";
import type { TicketDetail } from "../types";

const statusLabels: Record<TicketStatus, string> = {
  TO_DO: "To Do",
  IN_PROGRESS: "In Progress",
  REQUIRES_APPROVAL: "Requires Approval",
  DONE: "Done",
};

const statusHue: Record<TicketStatus, string> = {
  TO_DO: "gray",
  IN_PROGRESS: "blue",
  REQUIRES_APPROVAL: "yellow",
  DONE: "green",
};

const categoryLabels: Record<TicketCategory, string> = {
  PATCH: "Patch",
  CONFIG_CHANGE: "Config Change",
  VULN_REMEDIATION: "Vuln Remediation",
  ADVISORY_RESPONSE: "Advisory Response",
  CLINICAL_REVIEW: "Clinical Review",
  FIRMWARE_UPDATE: "Firmware Update",
  NETWORK_REMEDIATION: "Network Remediation",
  NEW_ASSET_PROCUREMENT: "New Asset Procurement",
  OTHER: "Other",
};

const sourceLabels: Record<TicketSource, string> = {
  WORKFLOW: "Workflow",
  MANUAL: "Manual",
  WEBHOOK: "Webhook",
  API: "API",
};

const formatDate = (date: Date | string | null | undefined) => {
  if (!date) return null;
  const d = date instanceof Date ? date : new Date(date);
  return format(d, "MMM d, yyyy");
};

const formatScheduled = (date: Date | string | null | undefined) => {
  if (!date) return null;
  const d = date instanceof Date ? date : new Date(date);
  return format(d, "MMM d, yyyy 'at' h:mm a");
};

const MetadataRow = ({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) => (
  <div className="flex flex-col gap-1">
    <span className="text-xs uppercase tracking-wide text-muted-foreground">
      {label}
    </span>
    <div>{children}</div>
  </div>
);

const CategoryChip = ({ category }: { category: TicketCategory }) => {
  const color = useCategoryColor(category);
  return (
    <Badge variant="outline" className={getChipClass(color)}>
      {categoryLabels[category]}
    </Badge>
  );
};

const Section = ({
  title,
  children,
  count,
}: {
  title: React.ReactNode;
  count?: number;
  children: React.ReactNode;
}) => (
  <section className="flex flex-col gap-3">
    <h2 className="text-sm font-semibold flex items-center gap-2">
      {title}
      {typeof count === "number" && (
        <Badge variant="secondary" className="text-xs">
          {count}
        </Badge>
      )}
    </h2>
    {children}
  </section>
);

type DetailAsset =
  TicketDetail["assets"][number];
type DetailRemediation =
  TicketDetail["remediations"][number];

const formatLocation = (location: unknown): string => {
  if (!location || typeof location !== "object") return "—";
  const loc = location as Record<string, unknown>;
  const parts = [loc.building, loc.floor, loc.room]
    .filter((v): v is string => typeof v === "string" && v.length > 0);
  return parts.length > 0 ? parts.join(" · ") : "—";
};

const truncate = (s: string, n = 80) =>
  s.length > n ? `${s.slice(0, n - 1)}…` : s;

const LinkedAssetsTable = ({
  assets,
  remediations,
}: {
  assets: DetailAsset[];
  remediations: DetailRemediation[];
}) => {
  // Map deviceGroupId → first remediation that affects it
  const remediationByDeviceGroup = new Map<string, DetailRemediation>();
  for (const r of remediations) {
    for (const dg of r.affectedDeviceGroups) {
      if (!remediationByDeviceGroup.has(dg.id)) {
        remediationByDeviceGroup.set(dg.id, r);
      }
    }
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Role</TableHead>
          <TableHead>Model</TableHead>
          <TableHead>IP Address</TableHead>
          <TableHead>MAC Address</TableHead>
          <TableHead>Location</TableHead>
          <TableHead>Remediation</TableHead>
        </TableRow>
      </TableHeader>
        <TableBody>
          {assets.map((a) => {
            const remediation = remediationByDeviceGroup.get(a.deviceGroupId);
            const model = a.deviceGroup
              ? [a.deviceGroup.manufacturer, a.deviceGroup.modelName]
                  .filter(Boolean)
                  .join(" ")
              : "—";
            return (
              <TableRow key={a.id} className="hover:bg-muted/40">
                <TableCell>
                  <Link
                    href={`/assets/${a.id}`}
                    className="text-sm hover:underline"
                  >
                    {a.role ?? "—"}
                  </Link>
                </TableCell>
                <TableCell className="text-sm">{model || "—"}</TableCell>
                <TableCell className="font-mono text-xs">{a.ip}</TableCell>
                <TableCell className="font-mono text-xs">
                  {a.macAddress ?? "—"}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {formatLocation(a.location)}
                </TableCell>
                <TableCell className="text-sm">
                  {remediation ? (
                    <span title={remediation.description ?? undefined}>
                      {truncate(
                        remediation.description ?? `Remediation ${remediation.id}`,
                        60,
                      )}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
  );
};

const AddCommentForm = ({ ticketId }: { ticketId: string }) => {
  const [body, setBody] = useState("");
  const addComment = useAddTicketComment(ticketId);
  const { data: session } = authClient.useSession();
  const trimmed = body.trim();
  const canSubmit = trimmed.length > 0 && !addComment.isPending;

  const submit = () => {
    if (!canSubmit) return;
    addComment.mutate(
      { ticketId, body: trimmed },
      { onSuccess: () => setBody("") },
    );
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="flex gap-3"
    >
      <UserAvatar user={session?.user ?? null} className="size-8 shrink-0" />
      <div className="flex flex-col gap-2 flex-1 min-w-0">
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Write a comment..."
          rows={3}
          disabled={addComment.isPending}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
              e.preventDefault();
              submit();
            }
          }}
        />
        <div className="flex justify-end">
          <Button type="submit" size="sm" disabled={!canSubmit}>
            {addComment.isPending ? "Posting..." : "Comment"}
          </Button>
        </div>
      </div>
    </form>
  );
};

const TicketDetailContent = ({ id }: { id: string }) => {
  const { data } = useSuspenseTrackingTicket(id);

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
            {data.lifeSafety && (
              <HeartPulseIcon
                className="size-6 text-destructive shrink-0 mt-1"
                aria-label="Life safety"
              />
            )}
            <h1 className="text-xl md:text-2xl font-semibold flex-1 min-w-0">
              {data.summary}
            </h1>
          </div>
        </div>
      }
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6 rounded-lg border bg-background p-4">
        <MetadataRow label="Assignee">
          <div className="flex items-center gap-1.5 text-sm">
            <UserIcon className="size-3.5 text-muted-foreground" />
            {data.assignee?.name ?? "Unassigned"}
          </div>
        </MetadataRow>
        <MetadataRow label="Department">
          {data.department ? (
            <Badge
              variant="outline"
              className={getChipClass(data.department.color)}
            >
              {data.department.name}
            </Badge>
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

      {data.description && (
        <div className="rounded-lg border bg-background p-4">
          <Section title="Description">
            <p className="text-sm whitespace-pre-wrap">{data.description}</p>
          </Section>
        </div>
      )}

      {data.children.length > 0 && (
        <Section title="Sub-tickets" count={data.children.length}>
          <ul className="flex flex-col gap-2">
            {data.children.map((child) => (
              <li key={child.id}>
                <Link
                  href={`/tracking/${child.id}`}
                  className="flex items-center justify-between gap-3 rounded-md border bg-background hover:bg-muted/50 transition px-3 py-2"
                >
                  <span className="text-sm font-medium truncate">
                    {child.summary}
                  </span>
                  <div className="flex items-center gap-2 shrink-0">
                    {child.department && (
                      <Badge
                        variant="outline"
                        className={getChipClass(child.department.color)}
                      >
                        {child.department.name}
                      </Badge>
                    )}
                    <Badge
                      variant="outline"
                      className={getChipClass(statusHue[child.status])}
                    >
                      {statusLabels[child.status]}
                    </Badge>
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <MessageSquareIcon className="size-3.5" />
                      {child._count.comments}
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <div className="rounded-lg border bg-background p-4 flex flex-col gap-3">
        <h2 className="text-sm font-semibold">Linked Items</h2>
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
            {data.assets.length > 0 ? (
              <LinkedAssetsTable
                assets={data.assets}
                remediations={data.remediations}
              />
            ) : (
              <p className="text-sm text-muted-foreground">
                No assets linked to this ticket.
              </p>
            )}
          </TabsContent>
          <TabsContent value="files" className="mt-4">
            <p className="text-sm text-muted-foreground">
              No files linked to this ticket.
            </p>
          </TabsContent>
        </Tabs>
      </div>

      {data.advisories.length > 0 && (
        <Section title="Advisories" count={data.advisories.length}>
          <ul className="flex flex-col gap-2">
            {data.advisories.map((a) => (
              <li key={a.id}>
                <Link
                  href={`/advisories/${a.id}`}
                  className="flex items-center justify-between gap-3 rounded-md border bg-background hover:bg-muted/50 transition px-3 py-2"
                >
                  <span className="text-sm">{a.title ?? a.id}</span>
                  <SeverityBadge severity={a.severity} />
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <div className="rounded-lg border bg-background p-4">
        <Section
          title={
            <span className="flex items-center gap-1.5">
              <MessageSquareIcon className="size-3.5" /> Comments
            </span>
          }
          count={data.comments.length}
        >
          {data.comments.length > 0 ? (
            <ul className="flex flex-col gap-3">
              {data.comments.map((c) => {
                const initials = (c.author.name ?? "?")
                  .split(/\s+/)
                  .map((p) => p[0])
                  .filter(Boolean)
                  .slice(0, 2)
                  .join("")
                  .toUpperCase();
                return (
                  <li key={c.id} className="flex gap-3">
                    <Avatar className="size-8 shrink-0">
                      {c.author.image && (
                        <AvatarImage
                          src={c.author.image}
                          alt={c.author.name ?? ""}
                        />
                      )}
                      <AvatarFallback className="text-xs">
                        {initials}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex flex-col min-w-0 flex-1">
                      <div className="flex items-center text-xs text-muted-foreground mb-1 gap-2">
                        <span className="font-bold text-foreground truncate">
                          {c.author.name}
                        </span>
                        <span>{formatDate(c.createdAt)}</span>
                      </div>
                      <p className="text-sm whitespace-pre-wrap">{c.body}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              No comments yet.
            </p>
          )}
          <AddCommentForm ticketId={data.id} />
        </Section>
      </div>
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
