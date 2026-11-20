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
import { createTRPCRouter, protectedProcedure } from "@/trpc/init";
import { requireExistence } from "@/trpc/middleware";
import {
  serializeWorkflow,
  workflowSerializeInclude,
  workflowsUsingAssetsOrDeviceTypes,
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
        const referencedDeviceTypeIds = [
          ...new Set(nodes.flatMap((n) => readIds(n.data, "deviceTypeIds"))),
        ];
        const [existingAssets, existingDeviceTypes] = await Promise.all([
          referencedAssetIds.length
            ? tx.asset.findMany({
                where: { id: { in: referencedAssetIds } },
                select: { id: true },
              })
            : [],
          referencedDeviceTypeIds.length
            ? tx.deviceType.findMany({
                where: { id: { in: referencedDeviceTypeIds } },
                select: { id: true },
              })
            : [],
        ]);
        const existingAssetIds = new Set(existingAssets.map((a) => a.id));
        const existingDeviceTypeIds = new Set(
          existingDeviceTypes.map((t) => t.id),
        );

        // so create nodes individually and connect their assets / device
        // types. The relation ids are stripped from the stored data blob
        for (const node of nodes) {
          const data = { ...((node.data as Record<string, unknown>) || {}) };
          delete data.assetIds;
          delete data.deviceTypeIds;

          const assetConnect = readIds(node.data, "assetIds").filter((aid) =>
            existingAssetIds.has(aid),
          );
          const deviceTypeConnect = readIds(node.data, "deviceTypeIds").filter(
            (tid) => existingDeviceTypeIds.has(tid),
          );

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
              ...(deviceTypeConnect.length
                ? {
                    deviceTypes: {
                      connect: deviceTypeConnect.map((tid) => ({ id: tid })),
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
        // getOne renders react-flow edges, so it needs connections on top of the
        // node-focused serialize include (which no longer loads them).
        include: { ...workflowSerializeInclude, connections: true },
      });

      const workflow = requireExistence(workflowOrNull, "Workflow");

      // Transform server nodes to react-flow compatible nodes. Linked asset /
      // device type ids live in relations, not data, so surface them into
      // node.data (the shape the editor reads and writes back on save).
      const nodes: Node[] = workflow.nodes.map((node) => ({
        id: node.id,
        type: node.type,
        position: node.position as { x: number; y: number },
        data: {
          ...((node.data as Record<string, unknown>) || {}),
          assetIds: node.assets.map((asset) => asset.id),
          deviceTypeIds: node.deviceTypes.map((deviceType) => deviceType.id),
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

  // Like getMany, but paginated results are serialized into the node-focused
  // shape (serializeWorkflow) that LLM/markdown consumers read.
  getManyForLlm: protectedProcedure
    .input(paginationInputSchema)
    .query(async ({ input }) => {
      const { search } = input;

      const whereFilter = {
        name: {
          contains: search,
          mode: "insensitive" as const,
        },
      };

      const totalCount = await prisma.workflow.count({ where: whereFilter });
      const meta = buildPaginationMeta(input, totalCount);

      const items = await prisma.workflow.findMany({
        skip: meta.skip,
        take: meta.take,
        where: whereFilter,
        include: workflowSerializeInclude,
        orderBy: { updatedAt: "desc" },
      });

      return createPaginatedResponse(items.map(serializeWorkflow), meta);
    }),

  // Clinical workflows that use an asset — either the asset is linked directly to
  // one of their nodes, or a node links the device type of the asset's product.
  getManyByAsset: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      const { id: assetId } = input;

      const asset = await prisma.asset.findUnique({
        where: { id: assetId },
        select: { product: { select: { deviceTypeId: true } } },
      });
      const found = requireExistence(asset, "Asset");

      // Workflows whose nodes link the asset directly or its device type (one
      // OR query dedupes by workflow id).
      const deviceTypeId = found.product?.deviceTypeId;
      const workflows = await prisma.workflow.findMany({
        where: workflowsUsingAssetsOrDeviceTypes(
          [assetId],
          deviceTypeId ? [deviceTypeId] : [],
        ),
        include: workflowSerializeInclude,
        orderBy: { updatedAt: "desc" },
      });

      return workflows.map(serializeWorkflow);
    }),
});
