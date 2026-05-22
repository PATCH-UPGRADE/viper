import "server-only";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import prisma from "@/lib/db";
import { createTRPCRouter, protectedProcedure } from "@/trpc/init";
import {
  assetFlowResponseSchema,
  type NetworkAsset,
  networkTopologySchema,
} from "../types";

const NETWORK_FLOW_URL = process.env.NETWORK_FLOW_URL;
const NETWORK_FLOW_TOKEN = process.env.NETWORK_FLOW_TOKEN;
const NETWORK_FLOW_TIMEOUT = 15 * 1000;

async function fetchNetworkTopology() {
  if (!NETWORK_FLOW_URL) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "NETWORK_FLOW_URL is not configured.",
    });
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), NETWORK_FLOW_TIMEOUT);

  try {
    const res = await fetch(NETWORK_FLOW_URL, {
      headers: {
        ...(NETWORK_FLOW_TOKEN
          ? { Authorization: `Bearer ${NETWORK_FLOW_TOKEN}` }
          : {}),
        Accept: "application/json",
      },
      signal: controller.signal,
    });

    if (!res.ok) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: `Network flow service responded with ${res.status}.`,
      });
    }

    const json = await res.json();
    return networkTopologySchema.parse(json);
  } catch (err) {
    if (err instanceof TRPCError) throw err;
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Failed to fetch network flow topology.",
      cause: err,
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

export const networkRouter = createTRPCRouter({
  // GET /api/v1/network/flow — authenticated proxy to the upstream topology service
  getFlow: protectedProcedure
    .meta({
      openapi: {
        method: "GET",
        path: "/network/flow",
        tags: ["Network"],
        summary: "Get Network Flow Topology",
        description: "Returns network flow topology data according to schema",
      },
    })
    .input(z.void())
    .output(networkTopologySchema)
    .query(async () => {
      return fetchNetworkTopology();
    }),

  // Internal — returns the 1-hop subgraph for a specific Viper asset, enriched with Prisma data
  // 1. Get the topology data from upstream
  // 2. Figure out if the asset user provides endpoints is in that data
  // 3. Gather connected assets, it's immediate neighborhood
  // 4. Enrich those assets with VIPER data
  getFlowForAsset: protectedProcedure
    .input(z.object({ assetId: z.string() }))
    .output(assetFlowResponseSchema)
    .query(async ({ input }) => {
      const topology = await fetchNetworkTopology();

      // Find the focal network asset by Viper cuid
      const focalNetworkAsset = topology.assets.find(
        (a: NetworkAsset) => a.id === input.assetId,
      );

      if (!focalNetworkAsset) {
        return { in_flow: false as const };
      }

      const connections = topology.connections ?? [];

      // Collect 1-hop connections and neighbour IDs
      const relevantConnections = connections.filter(
        (c) =>
          c.src_asset_id === input.assetId || c.dst_asset_id === input.assetId,
      );

      const neighbourIds = new Set<string>();
      for (const c of relevantConnections) {
        if (c.src_asset_id !== input.assetId) neighbourIds.add(c.src_asset_id);
        if (c.dst_asset_id !== input.assetId) neighbourIds.add(c.dst_asset_id);
      }

      const subgraphIds = [input.assetId, ...neighbourIds];

      const subgraphNetworkAssets = topology.assets.filter((a: NetworkAsset) =>
        subgraphIds.includes(a.id),
      );

      // Bulk-fetch Viper asset records for all IDs in the subgraph
      const viperAssets = await prisma.asset.findMany({
        where: { id: { in: subgraphIds } },
        select: {
          id: true,
          role: true,
          hostname: true,
          status: true,
          deviceGroup: { select: { cpe: true } },
        },
      });

      const viperAssetMap = new Map(viperAssets.map((a) => [a.id, a]));

      const enrichedAssets = subgraphNetworkAssets.map((networkAsset) => ({
        ...networkAsset,
        viper_data: viperAssetMap.get(networkAsset.id) ?? null,
      }));

      return {
        in_flow: true as const,
        focal_asset_id: input.assetId,
        assets: enrichedAssets,
        connections: relevantConnections,
      };
    }),
});
