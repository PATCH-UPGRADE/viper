"use client";

import { useQuery } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { Layer, Rectangle, ResponsiveContainer, Sankey } from "recharts";
import { DrawerSection } from "@/components/dashboard-drawers";
import type {
  EnrichedNetworkAsset,
  NetworkConnection,
} from "@/features/network/types";
import { useTRPC } from "@/trpc/client";
import { getAssetDeviceTypeLabel } from "../../utils";

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
  const deviceType = getAssetDeviceTypeLabel(asset.viper_data);
  const identifier =
    asset.viper_data?.hostname ?? getAssetIP(asset) ?? asset.id.slice(0, 8);
  if (deviceType) return `${deviceType} · ${identifier}`;
  return asset.viper_data?.hostname ?? asset.manufacturer ?? identifier;
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
  ip: string | null;
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

export function NetworkFlowSection({ assetId }: { assetId: string }) {
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
    <DrawerSection title="Network Flow">
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
    </DrawerSection>
  );
}
