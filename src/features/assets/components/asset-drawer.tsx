"use client";

import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import {
  BugIcon,
  ExternalLinkIcon,
  FileText,
  MessageSquare,
  ServerIcon,
  Wrench,
} from "lucide-react";
import { Suspense, useCallback, useState } from "react";
import { Layer, Rectangle, ResponsiveContainer, Sankey } from "recharts";
import {
  DashboardDrawerShell,
  InfoColumn,
  type InfoColumnSection,
} from "@/components/dashboard-drawers";
import { Badge } from "@/components/ui/badge";
import { CopyCode } from "@/components/ui/code";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { AIChat } from "@/features/chat/components/chat";
import { useChatUI } from "@/features/chat/context/chat-panel-context";
import {
  type SuggestedQuestion,
  SuggestedQuestionsProvider,
} from "@/features/chat/context/suggested-questions-context";
import type { UserRole } from "@/features/chat/utils";
import { IssuesSidebarList } from "@/features/issues/components/issue";
import type {
  EnrichedNetworkAsset,
  NetworkConnection,
} from "@/features/network/types";
import { RemediationCard } from "@/features/remediations/components/remediations";
import { deviceGroupCpeList, deviceGroupLabel } from "@/lib/markdown";
import { useTRPC } from "@/trpc/client";
import {
  type AssetWithIssueRelations,
  assetUtilizationSchema,
  locationSchema,
} from "../types";
import { getAssetRoleLabel } from "../utils";

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
// Utilization Grid
// ============================================================================

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
const DAY_NAMES = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;
const HOURS = Array.from({ length: 24 }, (_, i) => i);

function getUtilizationColor(value: number): string {
  if (value === 0) return "hsl(120, 0%, 82%)";
  const s = 30 + value * 0.6;
  const l = 70 - value * 0.25;
  return `hsl(120, ${s}%, ${l}%)`;
}

/*
 Example utilization data:
    [
      {"9": 1, "10": 12, "11": 8, "14": 3, "15": 5},  # 0 = Monday
      {"9": 1, "10": 8, "11": 15},                    # 1 = Tuesday
      {"9": 2, "14": 5},                              # 2 = Wednesday
      {"10": 6, "11": 9, "13": 4},                    # 3 = Thursday
      {"9": 1, "13": 2},                              # 4 = Friday
      {},                                             # 5 = Saturday
      {},                                             # 6 = Sunday
    ]
 Tuesday 9am to 10am, the device had 1% utilization throughout the hour, 10am-11am it was 8%, and 11am to 12pm it was 15%, and all other hours of the day it was offline (0% utilization)
 */
function AssetUtilizationGrid({
  utilization,
}: {
  utilization: AssetWithIssueRelations["utilization"];
}) {
  const parsed = assetUtilizationSchema.safeParse(utilization);
  const data = parsed.success ? parsed.data : null;

  if (!data) {
    return (
      <p className="text-sm text-muted-foreground">
        No device utilization data found
      </p>
    );
  }

  return (
    <div className="overflow-x-auto w-full">
      <table className="border-separate border-spacing-0.5 text-xs">
        <thead>
          <tr>
            <th className="sticky left-0 bg-background w-6 min-w-6" />
            {DAYS.map((day) => (
              <th
                key={day}
                className="text-muted-foreground font-medium text-center px-1 pb-1 min-w-8"
              >
                {day}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {HOURS.map((hour) => (
            <tr key={hour}>
              <td className="sticky left-0 bg-background text-muted-foreground text-right pr-1.5 tabular-nums leading-none py-0.5">
                {hour}
              </td>
              {data.map((dayData, dayIndex) => {
                const value = dayData[String(hour)] ?? 0;
                return (
                  <td key={dayIndex} className="p-0">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          aria-label={`${DAY_NAMES[dayIndex]} ${hour}:00 to ${hour + 1}:00, ${value}% utilization`}
                          className="w-16 h-3.5 rounded-sm cursor-default"
                          style={{
                            backgroundColor: getUtilizationColor(value),
                          }}
                        />
                      </TooltipTrigger>
                      <TooltipContent>
                        {DAY_NAMES[dayIndex]} {hour}:00–{hour + 1}:00 · {value}%
                      </TooltipContent>
                    </Tooltip>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ============================================================================
// Network Flow Section
// ============================================================================

const PORT_PROTOCOL_MAP: Record<number, string> = {
  21: "FTP",
  22: "SSH",
  23: "Telnet",
  25: "SMTP",
  53: "DNS",
  80: "HTTP",
  104: "DICOM",
  443: "HTTPS",
  445: "SMB",
  1433: "MSSQL",
  2049: "NFS",
  2575: "HL7",
  3389: "RDP",
  4840: "OPC-UA",
  5900: "VNC",
  8080: "HTTP",
  8443: "HTTPS",
  11112: "DICOM",
};

function getProtocolLabel(port: number, transport: "tcp" | "udp"): string {
  return PORT_PROTOCOL_MAP[port] ?? transport.toUpperCase();
}

function getAssetLabel(asset: EnrichedNetworkAsset): string {
  return (
    asset.viper_data?.role ??
    asset.viper_data?.hostname ??
    asset.manufacturer ??
    asset.id.slice(0, 8)
  );
}

function getAssetIP(asset: EnrichedNetworkAsset): string | null {
  return (
    asset.interfaces[0]?.ipv4_address ??
    asset.interfaces[0]?.ipv6_address ??
    null
  );
}

interface SankeyNodeData {
  name: string;
  tier: "focal" | "protocol" | "peer";
  ip: string | null;
}

function buildSankeyData(
  assets: EnrichedNetworkAsset[],
  connections: NetworkConnection[],
  focalId: string,
) {
  const focalAsset = assets.find((a) => a.id === focalId)!;
  const peers = assets.filter((a) => a.id !== focalId);

  const mapped = connections.map((c) => ({
    peerId: c.src_asset_id === focalId ? c.dst_asset_id : c.src_asset_id,
    proto: getProtocolLabel(c.dst_port, c.protocol),
  }));

  const protoSet = [...new Set(mapped.map((m) => m.proto))];

  const nodes: SankeyNodeData[] = [
    { name: getAssetLabel(focalAsset), tier: "focal", ip: null },
    ...protoSet.map((p) => ({ name: p, tier: "protocol" as const, ip: null })),
    ...peers.map((p) => ({
      name: getAssetLabel(p),
      tier: "peer" as const,
      ip: getAssetIP(p),
    })),
  ];

  const protoIdx = (p: string) => 1 + protoSet.indexOf(p);
  const peerIndexById = new Map(
    peers.map((a, idx) => [a.id, 1 + protoSet.length + idx] as const),
  );
  const peerIdx = (id: string) => peerIndexById.get(id);

  const focalToProto = new Map<string, number>();
  const protoToPeer = new Map<string, number>();
  for (const { peerId, proto } of mapped) {
    focalToProto.set(proto, (focalToProto.get(proto) ?? 0) + 1);
    const key = `${proto}|${peerId}`;
    protoToPeer.set(key, (protoToPeer.get(key) ?? 0) + 1);
  }

  const links = [
    ...Array.from(focalToProto.entries()).map(([proto, value]) => ({
      source: 0,
      target: protoIdx(proto),
      value,
    })),
    ...Array.from(protoToPeer.entries()).flatMap(([key, value]) => {
      const [proto, peerId] = key.split("|") as [string, string];
      const target = peerIdx(peerId);
      if (target === undefined) return [];
      return [{ source: protoIdx(proto), target, value }];
    }),
  ];

  return { nodes, links, protoCount: protoSet.length };
}

interface SankeyTooltip {
  label: string;
  ip: string;
  x: number;
  y: number;
}

interface SankeyNodeProps {
  x: number;
  y: number;
  width: number;
  height: number;
  index: number;
  payload: SankeyNodeData;
}

function NetworkFlowSection({ assetId }: { assetId: string }) {
  const trpc = useTRPC();
  const { data } = useQuery(
    trpc.network.getFlowForAsset.queryOptions({ assetId }),
  );
  const [tooltip, setTooltip] = useState<SankeyTooltip | null>(null);

  const renderNode = useCallback(
    ({ x, y, width, height, index, payload }: SankeyNodeProps) => {
      const fill =
        payload.tier === "focal"
          ? "var(--primary)"
          : payload.tier === "protocol"
            ? "var(--foreground)"
            : "var(--muted-foreground)";

      return (
        <Layer key={`node-${index}`}>
          <Rectangle
            x={x}
            y={y}
            width={width}
            height={height}
            fill={fill}
            fillOpacity={payload.tier === "protocol" ? 0.6 : 0.85}
            radius={3}
            onMouseEnter={() => {
              if (payload.tier === "peer" && payload.ip) {
                setTooltip({
                  label: payload.name,
                  ip: payload.ip,
                  x: x + width + 8,
                  y,
                });
              }
            }}
            onMouseLeave={() => setTooltip(null)}
          />
          <text
            x={payload.tier === "peer" ? x + width + 6 : x - 6}
            y={y + height / 2}
            dy="0.35em"
            textAnchor={payload.tier === "peer" ? "start" : "end"}
            fill="var(--muted-foreground)"
            fontSize={11}
          >
            {payload.name}
          </text>
        </Layer>
      );
    },
    [],
  );

  if (!data?.in_flow) return null;
  if (!data.connections.length) return null;

  const { nodes, links } = buildSankeyData(
    data.assets,
    data.connections,
    data.focal_asset_id,
  );

  return (
    <>
      <div className="border-t my-4" />
      <h3 className="text-sm font-medium text-muted-foreground mb-2">
        Network Flow
      </h3>
      <div className="relative h-64 w-full rounded-md border overflow-hidden">
        <ResponsiveContainer width="100%" height="100%">
          <Sankey
            data={{ nodes, links }}
            node={renderNode as never}
            link={{ stroke: "var(--border)", strokeOpacity: 0.4 }}
            margin={{ top: 10, right: 140, bottom: 10, left: 140 }}
          />
        </ResponsiveContainer>
        {tooltip && (
          <div
            className="absolute pointer-events-none z-10 bg-popover text-popover-foreground text-xs px-2 py-1 rounded-md border shadow-md"
            style={{ left: tooltip.x, top: tooltip.y }}
          >
            {tooltip.ip}
          </div>
        )}
      </div>
    </>
  );
}

// ============================================================================
// Details Section
// ============================================================================

function DetailsSection({ asset }: { asset: AssetWithIssueRelations }) {
  const locationResult = asset.location
    ? locationSchema.safeParse(asset.location)
    : null;
  const location = locationResult?.success ? locationResult.data : null;

  type Section =
    | { header: string; text: string }
    | { header: string; content: React.ReactNode };

  const sections: Section[] = [
    {
      header: "Device Overview",
      text: `${getAssetRoleLabel(asset)} — ${deviceGroupLabel(asset.deviceGroup)}`,
    },
    ...(location
      ? [
          {
            header: "Location",
            text: [
              location.facility,
              location.building,
              location.floor,
              location.room,
            ]
              .filter(Boolean)
              .join(" / "),
          } satisfies Section,
        ]
      : []),
    ...(asset.hostname
      ? [{ header: "Hostname", text: asset.hostname } satisfies Section]
      : []),
    {
      header: "Device Utilization",
      content: (
        <div className="overflow-x-auto">
          <AssetUtilizationGrid utilization={asset.utilization} />
        </div>
      ),
    },
  ];

  return (
    <div className="h-full overflow-y-scroll overflow-x-hidden">
      <div className="p-6 space-y-6">
        {sections.map((section, i) => (
          <div key={`details-${i}`}>
            {i > 0 && <div className="border-t my-4" />}
            <h3 className="text-sm font-medium text-muted-foreground mb-2">
              {section.header}
            </h3>
            {"text" in section ? (
              <p className="text-sm leading-relaxed">{section.text}</p>
            ) : (
              section.content
            )}
          </div>
        ))}
        <NetworkFlowSection assetId={asset.id} />
      </div>
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
        <RemediationCard
          remediation={remediation}
          key={`remediation-${remediation.id}`}
        />
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
          content: <div className="text-sm">{getAssetRoleLabel(asset)}</div>,
        },
        {
          header: "CPE",
          content: <CopyCode>{deviceGroupCpeList(asset.deviceGroup)}</CopyCode>,
        },
        ...(asset.deviceGroup.sbomUrl
          ? [
              {
                header: "SBOM",
                content: (
                  <a
                    href={asset.deviceGroup.sbomUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-primary hover:underline flex items-center gap-1 break-all"
                  >
                    View SBOM
                    <ExternalLinkIcon className="size-3 flex-shrink-0" />
                  </a>
                ),
              },
            ]
          : []),
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
  const { userRole } = useChatUI();

  const uniqueRemediationCount = new Set(
    asset.issues.flatMap((i) => i.vulnerability.remediations.map((r) => r.id)),
  ).size;

  const suggestedQuestions: Partial<Record<UserRole, SuggestedQuestion[]>> = {
    CISO: [
      { label: "Advise me on creating a remediation plan for this asset." },
      { label: "What is the overall risk posture of this asset?" },
      {
        label:
          "What is the potential business impact if this asset is compromised?",
      },
    ],
    "Clinical Staff": [
      { label: "How does this asset affect patient care workflows?" },
      {
        label:
          "What happens to patient monitoring if this device goes offline?",
      },
      { label: "Are there any safety risks for patients?" },
    ],
    "IT staff": [
      { label: "Advise me on creating a remediation plan for this asset." },
      { label: "What is the expected downtime for remediation?" },
      { label: "Are there dependencies on other systems?" },
    ],
    "hospital administration": [
      { label: "Advise me on creating a remediation plan for this asset." },
      { label: "How does this affect our regulatory compliance?" },
      { label: "What is the risk of delaying remediation?" },
    ],
    "biomedical engineer": [
      { label: "Advise me on creating a remediation plan for this asset." },
      { label: "Are there manufacturer advisories for this device?" },
      { label: "What is the clinical impact of applying this patch?" },
    ],
  };
  const visibleQuestions = suggestedQuestions[userRole] ?? [];

  const tabs = [
    {
      value: "details",
      label: "Details",
      icon: FileText,
      rawContent: true,
      content: <DetailsSection asset={asset} />,
    },
    {
      value: "chat",
      label: "AI Chat",
      icon: MessageSquare,
      content: (
        <SuggestedQuestionsProvider questions={visibleQuestions}>
          <AIChat config={{ agent: "giveRecommendations", assetData: asset }} />
        </SuggestedQuestionsProvider>
      ),
      rawContent: true,
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
      title={getAssetRoleLabel(asset)}
      description={description}
      tabs={tabs}
      infoColumn={<AssetInfoColumn asset={asset} />}
    >
      {children}
    </DashboardDrawerShell>
  );
}
