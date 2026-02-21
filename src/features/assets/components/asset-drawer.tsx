"use client";

import { formatDistanceToNow } from "date-fns";
import {
  BugIcon,
  ExternalLinkIcon,
  FileText,
  MessageSquare,
  ServerIcon,
  Wrench,
} from "lucide-react";
import { Suspense } from "react";
import {
  AIChatSection,
  DashboardDrawerShell,
  InfoColumn,
  type InfoColumnSection,
} from "@/components/dashboard-drawers";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CopyCode } from "@/components/ui/code";
import { Skeleton } from "@/components/ui/skeleton";
import { IssuesSidebarList } from "@/features/issues/components/issue";
import { plural } from "@/lib/utils";
import { type AssetWithIssueRelations, locationSchema } from "../types";

// ============================================================================
// Types
// ============================================================================

interface AssetDashboardDrawerProps {
  asset: AssetWithIssueRelations;
  open: boolean;
  setOpen: (open: boolean) => void;
  children?: React.ReactNode;
}

// ============================================================================
// Details Section
// ============================================================================

function DetailsSection({ asset }: { asset: AssetWithIssueRelations }) {
  const locationResult = asset.location
    ? locationSchema.safeParse(asset.location)
    : null;
  const location = locationResult?.success ? locationResult.data : null;

  const sections = [
    {
      header: "Device Overview",
      content: `${asset.role} — ${asset.deviceGroup.cpe}`,
    },
    ...(location
      ? [
          {
            header: "Location",
            content: [
              location.facility,
              location.building,
              location.floor,
              location.room,
            ]
              .filter(Boolean)
              .join(" / "),
          },
        ]
      : []),
    ...(asset.hostname
      ? [{ header: "Hostname", content: asset.hostname }]
      : []),
  ];

  return (
    <div className="space-y-6">
      {sections.map((section, i) => (
        <div key={`details-${i}`}>
          {i > 0 && <div className="border-t my-4" />}
          <h3 className="text-sm font-medium text-muted-foreground mb-2">
            {section.header}
          </h3>
          <p className="text-sm leading-relaxed">{section.content}</p>
        </div>
      ))}
    </div>
  );
}

// ============================================================================
// Remediations Section
// ============================================================================

function RemediationsSection({ asset }: { asset: AssetWithIssueRelations }) {
  const seen = new Set<string>();
  const remediations: AssetWithIssueRelations["issues"][number]["vulnerability"]["remediations"][number][] =
    [];

  for (const issue of asset.issues) {
    for (const rem of issue.vulnerability.remediations) {
      if (!seen.has(rem.id)) {
        seen.add(rem.id);
        remediations.push(rem);
      }
    }
  }

  if (remediations.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <div className="text-center space-y-2">
          <Wrench className="h-12 w-12 mx-auto opacity-50" />
          <p className="text-sm">No remediations available</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {remediations.map((remediation) => (
        <Card key={remediation.id}>
          <CardHeader>
            <div className="flex items-start justify-between">
              <CardTitle className="text-base font-medium">
                Remediation {remediation.id}
              </CardTitle>
              <Badge variant="outline">
                {remediation._count.artifacts}{" "}
                {plural("Artifact", remediation._count.artifacts)}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {remediation.description && (
              <p className="text-sm text-muted-foreground">
                {remediation.description}
              </p>
            )}
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <span>By {remediation.user.name}</span>
              <span>•</span>
              <span>
                {formatDistanceToNow(remediation.createdAt, {
                  addSuffix: true,
                })}
              </span>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ============================================================================
// Vulnerabilities Section
// ============================================================================

function VulnerabilitiesSection({ asset }: { asset: AssetWithIssueRelations }) {
  const issues = asset.issues;

  if (issues.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <div className="text-center space-y-2">
          <BugIcon className="h-12 w-12 mx-auto opacity-50" />
          <p className="text-sm">No vulnerabilities detected</p>
        </div>
      </div>
    );
  }

  return (
    <Suspense fallback={<Skeleton className="h-16 w-full" />}>
      <IssuesSidebarList issues={issues} type="vulnerabilities" />
    </Suspense>
  );
}

// ============================================================================
// Info Column
// ============================================================================

function AssetInfoColumn({ asset }: { asset: AssetWithIssueRelations }) {
  const locationResult = asset.location
    ? locationSchema.safeParse(asset.location)
    : null;
  const location = locationResult?.success ? locationResult.data : null;
  const locationParts = [
    location?.facility,
    location?.building,
    location?.floor,
    location?.room,
  ].filter(Boolean);

  const sections: InfoColumnSection[] = [
    {
      header: "Device Information",
      items: [
        {
          header: "Role",
          content: <div className="text-sm">{asset.role}</div>,
        },
        {
          header: "CPE",
          content: <CopyCode>{asset.deviceGroup.cpe}</CopyCode>,
        },
        ...(asset.serialNumber
          ? [
              {
                header: "Serial Number",
                content: <div className="text-sm">{asset.serialNumber}</div>,
              },
            ]
          : []),
        ...(locationParts.length > 0
          ? [
              {
                header: "Location",
                content: (
                  <div className="text-sm">{locationParts.join(" / ")}</div>
                ),
              },
            ]
          : []),
        ...(asset.status
          ? [
              {
                header: "Status",
                content: (
                  <Badge
                    variant={
                      asset.status === "Active"
                        ? "default"
                        : asset.status === "Decommissioned"
                          ? "secondary"
                          : "outline"
                    }
                  >
                    {asset.status}
                  </Badge>
                ),
              },
            ]
          : []),
      ],
    },
    {
      header: "Network Information",
      items: [
        {
          header: "IP Address",
          content: <CopyCode>{asset.ip}</CopyCode>,
        },
        ...(asset.networkSegment
          ? [
              {
                header: "Network Segment",
                content: <div className="text-sm">{asset.networkSegment}</div>,
              },
            ]
          : []),
        ...(asset.macAddress
          ? [
              {
                header: "MAC Address",
                content: <CopyCode>{asset.macAddress}</CopyCode>,
              },
            ]
          : []),
      ],
    },
    {
      header: "Connectors",
      items: [
        ...(asset.upstreamApi
          ? [
              {
                header: "Upstream API",
                content: (
                  <a
                    href={asset.upstreamApi}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-primary hover:underline flex items-center gap-1 break-all"
                  >
                    {asset.upstreamApi}
                    <ExternalLinkIcon className="size-3 flex-shrink-0" />
                  </a>
                ),
              },
            ]
          : []),
        ...(asset.externalMappings.length > 0
          ? [
              {
                header: "Integrations",
                content: (
                  <ul className="space-y-2">
                    {asset.externalMappings.map((mapping) => (
                      <li
                        key={mapping.id}
                        className="text-sm flex flex-col gap-0.5"
                      >
                        <span className="font-medium">
                          {mapping.integration.name}
                        </span>
                        {mapping.lastSynced && (
                          <span className="text-xs text-muted-foreground">
                            Last synced{" "}
                            {formatDistanceToNow(mapping.lastSynced, {
                              addSuffix: true,
                            })}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                ),
              },
            ]
          : []),
      ],
    },
    {
      header: "Metadata",
      items: [
        {
          header: "Created",
          content: (
            <div className="text-sm">
              {formatDistanceToNow(asset.createdAt, { addSuffix: true })} (
              {new Date(asset.createdAt).toLocaleString()})
            </div>
          ),
        },
        {
          header: "Last Updated",
          content: (
            <div className="text-sm">
              {formatDistanceToNow(asset.updatedAt, { addSuffix: true })} (
              {new Date(asset.updatedAt).toLocaleString()})
            </div>
          ),
        },
        {
          header: "Asset ID",
          content: <CopyCode>{asset.id}</CopyCode>,
        },
      ],
    },
  ];

  return <InfoColumn sections={sections} />;
}

// ============================================================================
// Main Drawer Component
// ============================================================================

export function AssetDashboardDrawer({
  asset,
  open,
  setOpen,
  children,
}: AssetDashboardDrawerProps) {
  const uniqueRemediationCount = new Set(
    asset.issues.flatMap((i) => i.vulnerability.remediations.map((r) => r.id)),
  ).size;

  const tabs = [
    {
      value: "details",
      label: "Details",
      icon: FileText,
      content: <DetailsSection asset={asset} />,
    },
    {
      value: "chat",
      label: "AI Chat",
      icon: MessageSquare,
      content: <AIChatSection />,
    },
    {
      value: "remediations",
      label: "Remediations",
      icon: Wrench,
      count: uniqueRemediationCount,
      content: <RemediationsSection asset={asset} />,
    },
    {
      value: "vulnerabilities",
      label: "Vulnerabilities",
      icon: BugIcon,
      count: asset.issues.length,
      content: <VulnerabilitiesSection asset={asset} />,
    },
  ];

  const description = (
    <>
      <Badge variant="outline" className="text-primary">
        <ServerIcon className="size-3 mr-1" />
        Hospital Asset
      </Badge>
      {asset.status && (
        <Badge
          variant={
            asset.status === "Active"
              ? "default"
              : asset.status === "Decommissioned"
                ? "secondary"
                : "outline"
          }
        >
          {asset.status}
        </Badge>
      )}
      <span className="text-sm">
        Updated{" "}
        {formatDistanceToNow(asset.updatedAt, {
          addSuffix: true,
        })}
      </span>
    </>
  );

  return (
    <DashboardDrawerShell
      open={open}
      setOpen={setOpen}
      title={asset.role}
      description={description}
      tabs={tabs}
      infoColumn={<AssetInfoColumn asset={asset} />}
    >
      {children}
    </DashboardDrawerShell>
  );
}
