import { TRPCError } from "@trpc/server";
import { z } from "zod";
import prisma from "@/lib/db";
import {
  buildPaginationMeta,
  createPaginatedResponse,
  createPaginatedResponseSchema,
  paginationInputSchema,
} from "@/lib/pagination";
import { cpeToDeviceGroup } from "@/lib/router-utils";
import {
  cpeSchema,
  deviceGroupSchema,
  deviceGroupSelect,
  safeUrlSchema,
  userIncludeSelect,
  userSchema,
} from "@/lib/schemas";
import { createTRPCRouter, protectedProcedure } from "@/trpc/init";
import { requireOwnership } from "@/trpc/middleware";

// Validation schemas
const remediationInputSchema = z.object({
  fixUri: safeUrlSchema,
  vulnerabilityId: z.string(),
  cpe: cpeSchema,
  description: z.string().min(1),
  narrative: z.string().min(1),
  upstreamApi: safeUrlSchema,
});

const vulnerabilitySchema = z.object({
  id: z.string(),
  affectedDeviceGroups: z.array(deviceGroupSchema),
  description: z.string(),
  impact: z.string(),
});

const remediationResponseSchema = z.object({
  id: z.string(),
  fixUri: z.string(),
  vulnerabilityId: z.string(),
  deviceGroup: deviceGroupSchema,
  description: z.string(),
  narrative: z.string(),
  upstreamApi: z.string(),
  userId: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
  user: userSchema,
  vulnerability: vulnerabilitySchema,
});

const paginatedRemediationResponseSchema = createPaginatedResponseSchema(
  remediationResponseSchema,
);

const remediationVulnerabilitySelect = {
  select: {
    id: true,
    affectedDeviceGroups: deviceGroupSelect,
    description: true,
    impact: true,
  },
} as const;

const remediationInclude = {
  user: userIncludeSelect,
  vulnerability: remediationVulnerabilitySelect,
  deviceGroup: deviceGroupSelect,
};

export const remediationsRouter = createTRPCRouter({
  // GET /api/remediations - List all remediations (any authenticated user can see all)
  getMany: protectedProcedure
    .input(paginationInputSchema)
    .meta({
      openapi: {
        method: "GET",
        path: "/remediations",
        tags: ["Remediations"],
        summary: "List Remediations",
        description:
          "Get all remediations. Any authenticated user can view all remediations.",
      },
    })
    .output(paginatedRemediationResponseSchema)
    .query(async ({ input }) => {
      const { search } = input;

      // Build search filter across multiple fields
      const searchFilter = search
        ? {
            OR: [
              {
                deviceGroup: {
                  cpe: {
                    contains: search,
                    mode: "insensitive" as const,
                  },
                },
              },
              {
                description: { contains: search, mode: "insensitive" as const },
              },
              { narrative: { contains: search, mode: "insensitive" as const } },
            ],
          }
        : {};

      // Get total count and build pagination metadata
      const totalCount = await prisma.remediation.count({
        where: searchFilter,
      });
      const meta = buildPaginationMeta(input, totalCount);

      // Fetch paginated items
      const items = await prisma.remediation.findMany({
        skip: meta.skip,
        take: meta.take,
        where: searchFilter,
        include: remediationInclude,
        orderBy: { createdAt: "desc" },
      });

      return createPaginatedResponse(items, meta);
    }),

  // GET /api/remediations/{id} - Get single remediation (any authenticated user can access)
  getOne: protectedProcedure
    .input(z.object({ id: z.string() }))
    .meta({
      openapi: {
        method: "GET",
        path: "/remediations/{id}",
        tags: ["Remediations"],
        summary: "Get Remediation",
        description:
          "Get a single remediation by ID. Any authenticated user can view any remediation.",
      },
    })
    .output(remediationResponseSchema)
    .query(async ({ input }) => {
      return prisma.remediation.findUniqueOrThrow({
        where: { id: input.id },
        include: remediationInclude,
      });
    }),

  // POST /api/remediations - Create remediation
  create: protectedProcedure
    .input(remediationInputSchema)
    .meta({
      openapi: {
        method: "POST",
        path: "/remediations",
        tags: ["Remediations"],
        summary: "Create Remediation",
        description:
          "Create a new remediation. The authenticated user will be recorded as the creator.",
      },
    })
    .output(remediationResponseSchema)
    .mutation(async ({ ctx, input }) => {
      // Verify the vulnerability exists
      const vulnerability = await prisma.vulnerability.findUnique({
        where: { id: input.vulnerabilityId },
      });

      if (!vulnerability) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Vulnerability not found",
        });
      }

      const { cpe, ...dataInput } = input;
      const deviceGroup = await cpeToDeviceGroup(cpe);
      return prisma.remediation.create({
        data: {
          ...dataInput,
          deviceGroupId: deviceGroup.id,
          userId: ctx.auth.user.id,
        },
        include: remediationInclude,
      });
    }),

  // DELETE /api/remediations/{id} - Delete remediation (only creator can delete)
  remove: protectedProcedure
    .input(z.object({ id: z.string() }))
    .meta({
      openapi: {
        method: "DELETE",
        path: "/remediations/{id}",
        tags: ["Remediations"],
        summary: "Delete Remediation",
        description:
          "Delete a remediation. Only the user who created the remediation can delete it.",
      },
    })
    .output(remediationResponseSchema)
    .mutation(async ({ ctx, input }) => {
      // Verify ownership
      await requireOwnership(input.id, ctx.auth.user.id, "remediation");

      return prisma.remediation.delete({
        where: { id: input.id },
        include: remediationInclude,
      });
    }),

  // PUT /api/remediations/{id} - Update remediation (only creator can update)
  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        data: remediationInputSchema,
      }),
    )
    .meta({
      openapi: {
        method: "PUT",
        path: "/remediations/{id}",
        tags: ["Remediations"],
        summary: "Update Remediation",
        description:
          "Update a remediation. Only the user who created the remediation can update it.",
      },
    })
    .output(remediationResponseSchema)
    .mutation(async ({ ctx, input }) => {
      // Verify ownership and get current data
      const remediation = await prisma.remediation.findUnique({
        where: { id: input.id },
        select: { userId: true, vulnerabilityId: true },
      });

      if (!remediation) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Remediation not found",
        });
      }

      if (remediation.userId !== ctx.auth.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You can only update remediations that you created",
        });
      }

      // Verify the vulnerability exists if it's being changed
      if (input.data.vulnerabilityId !== remediation.vulnerabilityId) {
        const vulnerability = await prisma.vulnerability.findUnique({
          where: { id: input.data.vulnerabilityId },
        });

        if (!vulnerability) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Vulnerability not found",
          });
        }
      }

      return prisma.remediation.update({
        where: { id: input.id },
        data: input.data,
        include: remediationInclude,
      });
    }),
});
