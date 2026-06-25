"use client";

import { format, formatDistanceToNow } from "date-fns";
import {
  ExternalLinkIcon,
  HeartIcon,
  MailIcon,
  MoreVerticalIcon,
  SlashIcon,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ErrorView, LoadingView } from "@/components/entity-components";
import { PriorityBadge } from "@/components/priority-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TlpBadge } from "@/features/advisories/components/advisories";
import { deviceGroupLabel } from "@/lib/string-utils";
import {
  useMarkNotificationRead,
  useSuspenseNotification,
} from "../hooks/use-notifications";
import type { NotificationDetailSource, RawEmailPayload } from "../types";
import { NotificationTypeBadge } from "./columns";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatSourceChannel(source: NotificationDetailSource): string {
  switch (source.channel) {
    case "Email":
      return "email";
    case "PolledApi":
      return "polled api";
    case "Crawl":
      return "crawl";
  }
}

type LocationJson = {
  facility?: string | null;
  building?: string | null;
  floor?: string | null;
  room?: string | null;
};

function formatLocation(location: unknown): string {
  if (!location || typeof location !== "object" || Array.isArray(location))
    return "—";
  const loc = location as LocationJson;
  const parts = [
    loc.facility,
    loc.building,
    loc.floor ? `Floor ${loc.floor}` : null,
    loc.room,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : "—";
}

// ---------------------------------------------------------------------------
// EmailSourceModal
// ---------------------------------------------------------------------------

function EmailSourceModal({
  source,
  open,
  onOpenChange,
}: {
  source: NotificationDetailSource;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const raw = source.raw as RawEmailPayload;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Original source email</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4 overflow-auto min-h-0">
          <Card>
            <CardContent className="pt-4">
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
                <dt className="font-medium text-muted-foreground">From</dt>
                <dd>{raw.from}</dd>
                <dt className="font-medium text-muted-foreground">Subject</dt>
                <dd>{raw.subject ?? "—"}</dd>
                <dt className="font-medium text-muted-foreground">Date</dt>
                <dd>{format(source.receivedAt, "PPP p")}</dd>
              </dl>
            </CardContent>
          </Card>
          {source.markdown && (
            <Card className="overflow-auto">
              <CardContent className="pt-4">
                <div className="text-sm leading-relaxed [&_h1]:text-xl [&_h1]:font-bold [&_h1]:mb-2 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:mb-1.5 [&_h3]:font-semibold [&_h3]:mb-1 [&_p]:mb-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:mb-3 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:mb-3 [&_li]:mb-1 [&_a]:text-primary [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:pl-4 [&_blockquote]:text-muted-foreground [&_code]:bg-muted [&_code]:px-1 [&_code]:rounded [&_code]:text-xs [&_pre]:bg-muted [&_pre]:p-3 [&_pre]:rounded [&_pre]:overflow-auto [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_hr]:border-border [&_hr]:my-4 [&_table]:w-full [&_th]:text-left [&_th]:font-semibold [&_td]:py-1 [&_tr]:border-b [&_tr]:border-border">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {source.markdown}
                  </ReactMarkdown>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// SourceReference
// ---------------------------------------------------------------------------

function SourceReference({ source }: { source: NotificationDetailSource }) {
  const [open, setOpen] = useState(false);
  const raw =
    source.channel === "Email" ? (source.raw as RawEmailPayload) : null;
  const label = raw?.subject ?? source.referenceUrl ?? source.channel;

  if (source.channel === "Email") {
    return (
      <>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex items-center gap-1 text-sm text-primary hover:underline text-left"
        >
          <span className="truncate max-w-xs">{label}</span>
          <MailIcon className="size-3 shrink-0" />
        </button>
        <EmailSourceModal source={source} open={open} onOpenChange={setOpen} />
      </>
    );
  }

  return (
    <a
      href={source.referenceUrl ?? "#"}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-1 text-sm text-primary hover:underline"
    >
      <span className="truncate max-w-xs">{label}</span>
      <ExternalLinkIcon className="size-3 shrink-0" />
    </a>
  );
}

// ---------------------------------------------------------------------------
// Loading / Error exports
// ---------------------------------------------------------------------------

export const NotificationDetailLoading = () => (
  <LoadingView message="Loading notification..." />
);

export const NotificationDetailError = () => (
  <ErrorView message="Error loading notification" />
);

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export const NotificationDetailPage = ({ id }: { id: string }) => {
  const { data: notification } = useSuspenseNotification(id);
  const markRead = useMarkNotificationRead();

  // biome-ignore lint/correctness/useExhaustiveDependencies: fire once on id change; markRead.mutate is stable
  useEffect(() => {
    if (notification.reads.length === 0) {
      markRead.mutate({ notificationId: id });
    }
  }, [id]);

  const displayTitle =
    notification.summary ?? notification.title ?? notification.id;

  const yCount = notification.deviceGroups.length;
  const xCount = notification.deviceGroups.filter(
    (m) => m.deviceGroup._count.assets > 0,
  ).length;

  const firstReceived =
    notification.sources.length > 0
      ? new Date(
          Math.min(
            ...notification.sources.map((s) =>
              new Date(s.receivedAt).getTime(),
            ),
          ),
        )
      : notification.createdAt;

  return (
    <div className="flex flex-col gap-6 p-8 w-full max-w-5xl">
      {/* Breadcrumb */}
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/inbox">All Notifications</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator>
            <SlashIcon />
          </BreadcrumbSeparator>
          <BreadcrumbItem>
            <BreadcrumbPage className="max-w-sm truncate">
              {displayTitle}
            </BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      {/* Badge row */}
      <div className="flex items-center gap-2">
        <NotificationTypeBadge type={notification.type} />
        <PriorityBadge priority={notification.priority} />
      </div>

      {/* Title */}
      <h1 className="text-3xl font-semibold tracking-tight">
        {notification.title}
      </h1>

      {/* Meta line */}
      <p className="text-sm text-muted-foreground -mt-3">
        {formatDistanceToNow(notification.createdAt, { addSuffix: true })}
        {notification.sources.length > 0 && (
          <>
            {" · "}
            {notification.sources.length} source
            {notification.sources.length !== 1 ? "s" : ""} (
            {[...new Set(notification.sources.map(formatSourceChannel))].join(", ")})
          </>
        )}
      </p>

      {/* Device group coverage alert */}
      {yCount > xCount && (
        <Alert>
          <AlertDescription>
            <b>This advisory applies to {xCount} device groups.</b> The original
            notification listed {yCount} device groups.
          </AlertDescription>
        </Alert>
      )}

      {/* Tabs */}
      <Tabs defaultValue="overview">
        <TabsList variant="line">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="affected-assets">Affected Assets</TabsTrigger>
        </TabsList>

        {/* ----------------------------------------------------------------- */}
        {/* Overview tab                                                       */}
        {/* ----------------------------------------------------------------- */}
        <TabsContent value="overview" className="flex flex-col gap-4 mt-4">
          {/* Hospital Impact */}
          {notification.hospitalImpact && (
            <Alert>
              <HeartIcon className="size-4" />
              <AlertTitle>Hospital Impact</AlertTitle>
              <AlertDescription>{notification.hospitalImpact}</AlertDescription>
            </Alert>
          )}

          {/* Summary */}
          {notification.summary && (
            <Card>
              <CardHeader>
                <CardTitle>Summary</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm leading-relaxed">
                  {notification.summary}
                </p>
              </CardContent>
            </Card>
          )}

          {/* Details */}
          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent>
              <table className="w-full text-sm">
                <tbody>
                  <tr className="border-b">
                    <td className="py-2 pr-3 w-48 align-top">
                      <Badge variant="secondary">TLP</Badge>
                    </td>
                    <td className="py-2 align-top text-muted-foreground">
                      {notification.tlp ? (
                        <TlpBadge tlp={notification.tlp} />
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                  <tr className="border-b">
                    <td className="py-2 pr-3 w-48 align-top">
                      <Badge variant="secondary">First Received</Badge>
                    </td>
                    <td className="py-2 align-top text-muted-foreground">
                      {format(firstReceived, "PPP p")}
                    </td>
                  </tr>
                  <tr className="last:border-0">
                    <td className="py-2 pr-3 w-48 align-top">
                      <Badge variant="secondary">References</Badge>
                    </td>
                    <td className="py-2 align-top">
                      {notification.sources.length === 0 ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <div className="flex flex-col gap-1.5">
                          {notification.sources.map((source) => (
                            <SourceReference key={source.id} source={source} />
                          ))}
                        </div>
                      )}
                    </td>
                  </tr>
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ----------------------------------------------------------------- */}
        {/* Affected Assets tab                                                */}
        {/* ----------------------------------------------------------------- */}
        <TabsContent
          value="affected-assets"
          className="flex flex-col gap-4 mt-4"
        >
          {xCount === 0 ? (
            <p className="text-sm text-muted-foreground">
              No device groups with matching assets found.
            </p>
          ) : (
            notification.deviceGroups
              .filter((m) => m.deviceGroup._count.assets > 0)
              .map((mapping) => (
                <Card key={mapping.id}>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      {deviceGroupLabel(mapping.deviceGroup)}
                      <Badge variant="secondary" className="font-normal">
                        {mapping.deviceGroup._count.assets}
                      </Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Asset ID</TableHead>
                          <TableHead>IP Address</TableHead>
                          <TableHead>Location</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="w-10" />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {mapping.deviceGroup.assets.map((asset) => (
                          <TableRow key={asset.id}>
                            <TableCell className="font-mono text-xs">
                              {asset.hostname ?? asset.id}
                            </TableCell>
                            <TableCell>{asset.ip}</TableCell>
                            <TableCell>
                              {formatLocation(asset.location)}
                            </TableCell>
                            <TableCell>{asset.status ?? "—"}</TableCell>
                            <TableCell>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="icon">
                                    <MoreVerticalIcon className="size-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem asChild>
                                    <Link href={`/assets/${asset.id}`}>
                                      View Asset Detail
                                    </Link>
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              ))
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};
