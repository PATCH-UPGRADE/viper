import { z } from "zod";

// ============================================================================
// Network Topology Schema
// Mirrors the upstream "Network Topology Snapshot (Minimal, Flow-Derived)" spec.
// Asset IDs are Viper cuid strings — matching Viper's asset.id directly.
// ============================================================================

export const networkInterfaceSchema = z.object({
  id: z.string(),
  mac_address: z
    .string()
    .regex(/^([0-9a-fA-F]{2}:){5}[0-9a-fA-F]{2}$/)
    .nullable()
    .optional(),
  ipv4_address: z.string().nullable().optional(),
  ipv6_address: z.string().nullable().optional(),
});
export type NetworkInterface = z.infer<typeof networkInterfaceSchema>;

export const networkServiceSchema = z.object({
  port: z.number().int().min(1).max(65535),
  protocol: z.enum(["tcp", "udp"]),
});
export type NetworkService = z.infer<typeof networkServiceSchema>;

export const networkAssetSchema = z.object({
  id: z.string(),
  manufacturer: z.string().nullable().optional(),
  interfaces: z.array(networkInterfaceSchema).min(1),
  services: z.array(networkServiceSchema).optional(),
});
export type NetworkAsset = z.infer<typeof networkAssetSchema>;

export const networkConnectionSchema = z.object({
  src_asset_id: z.string(),
  dst_asset_id: z.string(),
  dst_port: z.number().int().min(1).max(65535),
  protocol: z.enum(["tcp", "udp"]),
  direction: z.enum(["unidirectional", "bidirectional"]),
});
export type NetworkConnection = z.infer<typeof networkConnectionSchema>;

export const networkTopologySchema = z.object({
  schema_version: z.literal("0.1.0-minimal"),
  snapshot_id: z
    .string()
    .uuid()
    .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/),
  timestamp: z.string().datetime(),
  assets: z.array(networkAssetSchema).min(1),
  connections: z.array(networkConnectionSchema).optional(),
});
export type NetworkTopology = z.infer<typeof networkTopologySchema>;

// ============================================================================
// Enriched types — for the internal getFlowForAsset endpoint
// ============================================================================

export const viperAssetDataSchema = z.object({
  id: z.string(),
  role: z.string().nullable(),
  hostname: z.string().nullable(),
  status: z.enum(["Active", "Decommissioned", "Maintenance"]).nullable(),
  deviceGroup: z.object({
    cpe: z.string(),
  }),
});
export type ViperAssetData = z.infer<typeof viperAssetDataSchema>;

export const enrichedNetworkAssetSchema = networkAssetSchema.extend({
  viper_data: viperAssetDataSchema.nullable(),
});
export type EnrichedNetworkAsset = z.infer<typeof enrichedNetworkAssetSchema>;

export const assetFlowResponseSchema = z.discriminatedUnion("in_flow", [
  z.object({ in_flow: z.literal(false) }),
  z.object({
    in_flow: z.literal(true),
    focal_asset_id: z.string(),
    assets: z.array(enrichedNetworkAssetSchema),
    connections: z.array(networkConnectionSchema),
  }),
]);
export type AssetFlowResponse = z.infer<typeof assetFlowResponseSchema>;
