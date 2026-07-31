import type { Edge, Node } from "@xyflow/react";
import { generateSlug } from "random-word-slugs";
import { z } from "zod";
import type { NodeType } from "@/generated/prisma";
import prisma from "@/lib/db";
import {
  buildPaginationMeta,
  createPaginatedResponse,
  paginationInputSchema,
} from "@/lib/pagination";
import { findMatchingIdsForDeviceGroup } from "@/lib/router-utils";
import { createTRPCRouter, protectedProcedure } from "@/trpc/init";
import { requireExistence } from "@/trpc/middleware";
import {
  serializeWorkflow,
  workflowSerializeInclude,
  workflowsUsingAssetsOrMatchings,
} from "../utils";

export const workflowsRouter = createTRPCRouter({
  create: protectedProcedure.mutation(({ ctx }) => {
    return prisma.workflow.create({
      data: {
        name: generateSlug(3),
        description: null,
        userId: ctx.auth.user.id,
      },
    });
  }),
  remove: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ input }) => {
      return prisma.workflow.delete({
        where: {
          id: input.id,
        },
      });
    }),
  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        nodes: z.array(
          z.object({
            id: z.string(),
            type: z.string().nullish(),
            position: z.object({ x: z.number(), y: z.number() }),
            data: z.record(z.string(), z.any()).optional(),
          }),
        ),
        edges: z.array(
          z.object({
            source: z.string(),
            target: z.string(),
            sourceHandle: z.string().nullish(),
            targetHandle: z.string().nullish(),
          }),
        ),
      }),
    )
    .mutation(async ({ input }) => {
      const { id, nodes, edges } = input;

      const workflowOrNull = await prisma.workflow.findUnique({
        where: { id },
      });

      const workflow = requireExistence(workflowOrNull, "Workflow");

      // Read a node's transient relation-id list out of its data blob.
      const readIds = (data: unknown, key: string): string[] => {
        const value = (data as Record<string, unknown> | undefined)?.[key];
        return Array.isArray(value)
          ? value.filter((x): x is string => typeof x === "string")
          : [];
      };

      // Transaction to ensure consistency
      return await prisma.$transaction(async (tx) => {
        // Delete existing nodes and connections (cascade deletes connections)
        await tx.node.deleteMany({
          where: { workflowId: id },
        });

        // Connect only relation ids that actually exist, so a mistyped id in the
        // editor doesn't fail the whole save.
        const referencedAssetIds = [
          ...new Set(nodes.flatMap((n) => readIds(n.data, "assetIds"))),
        ];
        const referencedDgmIds = [
          ...new Set(
            nodes.flatMap((n) => readIds(n.data, "deviceGroupMatchingIds")),
          ),
        ];
        const existingAssetIds = new Set(
          referencedAssetIds.length
            ? (
                await tx.asset.findMany({
                  where: { id: { in: referencedAssetIds } },
                  select: { id: true },
                })
              ).map((a) => a.id)
            : [],
        );
        const existingDgmIds = new Set(
          referencedDgmIds.length
            ? (
                await tx.deviceGroupMatching.findMany({
                  where: { id: { in: referencedDgmIds } },
                  select: { id: true },
                })
              ).map((m) => m.id)
            : [],
        );

        // so create nodes individually and connect their assets / device-group
        // matchings. The relation ids are stripped from the stored data blob
        for (const node of nodes) {
          const data = { ...((node.data as Record<string, unknown>) || {}) };
          delete data.assetIds;
          delete data.deviceGroupMatchingIds;

          const assetConnect = readIds(node.data, "assetIds").filter((aid) =>
            existingAssetIds.has(aid),
          );
          const dgmConnect = readIds(
            node.data,
            "deviceGroupMatchingIds",
          ).filter((mid) => existingDgmIds.has(mid));

          await tx.node.create({
            data: {
              id: node.id,
              workflowId: id,
              name: node.type || "unknown",
              type: node.type as NodeType,
              position: node.position,
              data,
              ...(assetConnect.length
                ? {
                    assets: {
                      connect: assetConnect.map((aid) => ({ id: aid })),
                    },
                  }
                : {}),
              ...(dgmConnect.length
                ? {
                    deviceGroupMatchings: {
                      connect: dgmConnect.map((mid) => ({ id: mid })),
                    },
                  }
                : {}),
            },
          });
        }

        // Create connections
        await tx.connection.createMany({
          data: edges.map((edge) => ({
            workflowId: id,
            fromNodeId: edge.source,
            toNodeId: edge.target,
            fromOutput: edge.sourceHandle || "main",
            toInput: edge.targetHandle || "main",
          })),
        });

        // Update workflow's updateAt timestamp
        await tx.workflow.update({
          where: { id },
          data: { updatedAt: new Date() },
        });

        return workflow;
      });
    }),
  updateName: protectedProcedure
    .input(z.object({ id: z.string(), name: z.string().min(1) }))
    .mutation(({ ctx, input }) => {
      return prisma.workflow.update({
        where: { id: input.id, userId: ctx.auth.user.id },
        data: { name: input.name },
      });
    }),
  updateDescription: protectedProcedure
    .input(z.object({ id: z.string(), description: z.string().trim() }))
    .mutation(({ ctx, input }) => {
      return prisma.workflow.update({
        where: { id: input.id, userId: ctx.auth.user.id },
        data: {
          description: input.description.length ? input.description : null,
        },
      });
    }),
  getOne: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      const workflowOrNull = await prisma.workflow.findUnique({
        where: { id: input.id },
        include: workflowSerializeInclude,
      });

      const workflow = requireExistence(workflowOrNull, "Workflow");

      // Transform server nodes to react-flow compatible nodes. Linked asset /
      // device-group-matching ids live in relations, not data, so surface them
      // into node.data (the shape the editor reads and writes back on save).
      const nodes: Node[] = workflow.nodes.map((node) => ({
        id: node.id,
        type: node.type,
        position: node.position as { x: number; y: number },
        data: {
          ...((node.data as Record<string, unknown>) || {}),
          assetIds: node.assets.map((asset) => asset.id),
          deviceGroupMatchingIds: node.deviceGroupMatchings.map(
            (matching) => matching.id,
          ),
        },
      }));

      // Transform server connections to react-flow compatible edges
      const edges: Edge[] = workflow.connections.map((connection) => ({
        id: connection.id,
        source: connection.fromNodeId,
        target: connection.toNodeId,
        sourceHandle: connection.fromOutput,
        targetHandle: connection.toInput,
      }));

      return {
        id: workflow.id,
        name: workflow.name,
        description: workflow.description,
        nodes,
        edges,
      };
    }),
  getMany: protectedProcedure
    .input(paginationInputSchema)
    .query(async ({ input }) => {
      const { search } = input;

      const whereFilter = {
        name: {
          contains: search,
          mode: "insensitive" as const,
        },
      };

      // Get total count and build pagination metadata
      const totalCount = await prisma.workflow.count({ where: whereFilter });
      const meta = buildPaginationMeta(input, totalCount);

      // Fetch paginated items
      const items = await prisma.workflow.findMany({
        skip: meta.skip,
        take: meta.take,
        where: whereFilter,
        orderBy: { updatedAt: "desc" },
      });

      return createPaginatedResponse(items, meta);
    }),

  // Clinical workflows that use an asset — either the asset is linked directly to
  // one of their nodes, or a node links a device-group matching that applies to
  // the asset's device group.
  getManyByAsset: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      const { id: assetId } = input;

      const asset = await prisma.asset.findUnique({
        where: { id: assetId },
        select: {
          deviceGroup: {
            select: {
              id: true,
              vendorId: true,
              productId: true,
              versionId: true,
              version: { select: { canonicalName: true } },
            },
          },
        },
      });
      const found = requireExistence(asset, "Asset");

      // Device-group matchings that apply to this asset's device group, then
      // workflows whose nodes link the asset directly or one of those matchings
      // (one OR query dedupes by workflow id).
      const applicableMatchingIds = await findMatchingIdsForDeviceGroup(
        found.deviceGroup,
      );
      const workflows = await prisma.workflow.findMany({
        where: workflowsUsingAssetsOrMatchings(
          [assetId],
          applicableMatchingIds,
        ),
        include: workflowSerializeInclude,
        orderBy: { updatedAt: "desc" },
      });

      return workflows.map(serializeWorkflow);
    }),
});
