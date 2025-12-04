import prisma from "@/lib/db";
import { createTRPCRouter, protectedProcedure } from "@/trpc/init";
import z from "zod";
import {
  userSchema,
  userIncludeSelect,
  safeUrlSchema,
  cpeSchema,
} from "@/lib/schemas";
import {
  paginationInputSchema,
  buildPaginationMeta,
  createPaginatedResponse,
  createPaginatedResponseSchema,
} from "@/lib/pagination";
import { requireOwnership } from "@/trpc/middleware";
import { VulnerabilityCredentials } from "@/generated/prisma";

// Validation schemas
const vulnerabilityInputSchema = z.object({
  sarif: z.any(), // JSON data - Prisma JsonValue type
  cpe: cpeSchema,
  exploitUri: safeUrlSchema,
  upstreamApi: safeUrlSchema,
  description: z.string().min(1),
  narrative: z.string().min(1),
  impact: z.string().min(1),
});

const vulnerabilityResponseSchema = z.object({
  id: z.string(),
  sarif: z.any(), // JSON data - Prisma JsonValue type
  cpe: z.string(),
  exploitUri: z.string(),
  upstreamApi: z.string(),
  description: z.string(),
  narrative: z.string(),
  impact: z.string(),
  userId: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
  user: userSchema,
});

const paginatedVulnerabilityResponseSchema = createPaginatedResponseSchema(
  vulnerabilityResponseSchema,
);


// TODO: DRY with assets/server/routers.ts
const vulnerabilityCredentialsInputSchema = z.object({
  url: safeUrlSchema,
  name: z.string().min(1),
  token: z.string().min(1),
});

const integrationsResponseSchema = z.object({
  id: z.string(),
  url: z.string(),
  name: z.string(),
  hasToken: z.boolean(),
  userId: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
  user: userSchema,
});

const paginatedIntegrationsResponseSchema = createPaginatedResponseSchema(
  integrationsResponseSchema,
);

export const vulnerabilitiesRouter = createTRPCRouter({
  // GET /api/vulnerabilities - List all vulnerabilities (any authenticated user can see all)
  getMany: protectedProcedure
    .input(paginationInputSchema)
    .meta({
      openapi: {
        method: "GET",
        path: "/vulnerabilities",
        tags: ["Vulnerabilities"],
        summary: "List Vulnerabilities",
        description:
          "Get all vulnerabilities. Any authenticated user can view all vulnerabilities.",
      },
    })
    .output(paginatedVulnerabilityResponseSchema)
    .query(async ({ input }) => {
      const { search } = input;

      // Build search filter across multiple fields
      const searchFilter = search
        ? {
            OR: [
              { cpe: { contains: search, mode: "insensitive" as const } },
              {
                description: { contains: search, mode: "insensitive" as const },
              },
              { impact: { contains: search, mode: "insensitive" as const } },
            ],
          }
        : {};

      // Get total count and build pagination metadata
      const totalCount = await prisma.vulnerability.count({
        where: searchFilter,
      });
      const meta = buildPaginationMeta(input, totalCount);

      // Fetch paginated items
      const items = await prisma.vulnerability.findMany({
        skip: meta.skip,
        take: meta.take,
        where: searchFilter,
        include: { user: userIncludeSelect },
        orderBy: { createdAt: "desc" },
      });

      return createPaginatedResponse(items, meta);
    }),

  // GET /api/vulnerabilities/{id} - Get single vulnerability (any authenticated user can access)
  getOne: protectedProcedure
    .input(z.object({ id: z.string() }))
    .meta({
      openapi: {
        method: "GET",
        path: "/vulnerabilities/{id}",
        tags: ["Vulnerabilities"],
        summary: "Get Vulnerability",
        description:
          "Get a single vulnerability by ID. Any authenticated user can view any vulnerability.",
      },
    })
    .output(vulnerabilityResponseSchema)
    .query(async ({ input }) => {
      return prisma.vulnerability.findUniqueOrThrow({
        where: { id: input.id },
        include: { user: userIncludeSelect },
      });
    }),

  // POST /api/vulnerabilities - Create vulnerability
  create: protectedProcedure
    .input(vulnerabilityInputSchema)
    .meta({
      openapi: {
        method: "POST",
        path: "/vulnerabilities",
        tags: ["Vulnerabilities"],
        summary: "Create Vulnerability",
        description:
          "Create a new vulnerability. The authenticated user will be recorded as the creator.",
      },
    })
    .output(vulnerabilityResponseSchema)
    .mutation(({ ctx, input }) => {
      return prisma.vulnerability.create({
        data: {
          ...input,
          userId: ctx.auth.user.id,
        },
        include: { user: userIncludeSelect },
      });
    }),

  // DELETE /api/vulnerabilities/{id} - Delete vulnerability (only creator can delete)
  remove: protectedProcedure
    .input(z.object({ id: z.string() }))
    .meta({
      openapi: {
        method: "DELETE",
        path: "/vulnerabilities/{id}",
        tags: ["Vulnerabilities"],
        summary: "Delete Vulnerability",
        description:
          "Delete a vulnerability. Only the user who created the vulnerability can delete it.",
      },
    })
    .output(vulnerabilityResponseSchema)
    .mutation(async ({ ctx, input }) => {
      // Verify ownership
      await requireOwnership(input.id, ctx.auth.user.id, "vulnerability");

      return prisma.vulnerability.delete({
        where: { id: input.id },
        include: { user: userIncludeSelect },
      });
    }),

  // PUT /api/vulnerabilities/{id} - Update vulnerability (only creator can update)
  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        data: vulnerabilityInputSchema,
      }),
    )
    .meta({
      openapi: {
        method: "PUT",
        path: "/vulnerabilities/{id}",
        tags: ["Vulnerabilities"],
        summary: "Update Vulnerability",
        description:
          "Update a vulnerability. Only the user who created the vulnerability can update it.",
      },
    })
    .output(vulnerabilityResponseSchema)
    .mutation(async ({ ctx, input }) => {
      // Verify ownership
      await requireOwnership(input.id, ctx.auth.user.id, "vulnerability");

      return prisma.vulnerability.update({
        where: { id: input.id },
        data: input.data,
        include: { user: userIncludeSelect },
      });
    }),


  // GET /api/assets/integrations - List all vulnerability integrations
  getIntegrations: protectedProcedure
    .input(paginationInputSchema)
    .meta({
      openapi: {
        method: "GET",
        path: "/vulnerabilities/integrations",
        tags: ["Vulnerabilities"],
        summary: "Get Vulnerability Manager integrations",
        description:
          "Get all vulnerability managers that have been set up. Any authenticated user can view all integrations.",
      },
    })
    .output(paginatedIntegrationsResponseSchema)
    .query(async ({ input }) => {
      const { search } = input;

      const searchFilter = search
        ? {
            OR: [
              { name: { contains: search, mode: "insensitive" as const } },
              { url: { contains: search, mode: "insensitive" as const } },
            ],
          }
        : {};

      // Get total count and build pagination metadata
      /*const totalCount = await prisma.vulnerabilityCredentials.count({
        where: searchFilter,
      });
      const meta = buildPaginationMeta(input, totalCount);

      // Fetch paginated items
      const rawItems = await prisma.vulnerabilityCredentials.findMany({
        skip: meta.skip,
        take: meta.take,
        where: searchFilter,
        select: {
          id: true,
          url: true,
          name: true,
          token: true, // Select to check if exists, but don't return
          userId: true,
          createdAt: true,
          updatedAt: true,
          user: userIncludeSelect,
        },
        orderBy: { createdAt: "desc" },
      });

      // Map items to exclude token and add hasToken flag
      const items = rawItems.map(({ token, ...item }) => ({
        ...item,
        hasToken: !!token && token.length > 0,
      }));*/
      const items:VulnerabilityCredentials[] = [];
      const totalCount = 0;
      const meta = buildPaginationMeta(input, totalCount);

      return createPaginatedResponse(items, meta);
    }),

  // POST /api/vulnerabilities/integrations - Create vulnerability integration 
  createIntegration: protectedProcedure
    .input(vulnerabilityCredentialsInputSchema)
    .meta({
      openapi: {
        method: "POST",
        path: "/vulnerabilities/integrations",
        tags: ["Vulnerabilities"],
        summary: "Create Vulnerability Manager",
        description:
          "Create a new vulnerability manager to sync from. The authenticated user will be recorded as the creator.",
      },
    })
    .output(integrationsResponseSchema)
    .mutation(async ({ ctx, input }) => {
      const created = await prisma.vulnerabilityCredentials.create({
        data: {
          ...input,
          userId: ctx.auth.user.id,
        },
        select: {
          id: true,
          url: true,
          name: true,
          token: true, // Select to check if exists, but don't return
          userId: true,
          createdAt: true,
          updatedAt: true,
          user: userIncludeSelect,
        },
      });

      // Exclude token from response, add hasToken flag
      const { token, ...response } = created;
      return {
        ...response,
        hasToken: !!token && token.length > 0,
      };
    }),
});
