import { TRPCError } from "@trpc/server";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma";
import prisma from "@/lib/db";
import {
  createPaginatedResponseSchema,
  paginationInputSchema,
} from "@/lib/pagination";
import {
  cpesToDeviceGroups,
  createArtifactWrappers,
  fetchPaginated,
  transformArtifactWrapper,
} from "@/lib/router-utils";
import {
  artifactInputSchema,
  artifactWrapperSelect,
  artifactWrapperWithUrlsSchema,
  cpeSchema,
  deviceGroupSchema,
  deviceGroupSelect,
  safeUrlSchema,
  userIncludeSelect,
  userSchema,
} from "@/lib/schemas";
import { createTRPCRouter, protectedProcedure } from "@/trpc/init";
import { requireExistence, requireOwnership } from "@/trpc/middleware";

// Validation schemas
const remediationInputSchema = z.object({
  cpes: z.array(cpeSchema).min(1),
  vulnerabilityId: z.string().optional(),
  description: z.string().optional(),
  narrative: z.string().optional(),
  upstreamApi: safeUrlSchema.optional(),
  artifacts: z
    .array(artifactInputSchema)
    .min(1, "at least one artifact is required"),
});

const remediationUpdateSchema = z.object({
  id: z.string(),
  cpes: z.array(cpeSchema).optional(),
  vulnerabilityId: z.string().optional(),
  description: z.string().optional(),
  narrative: z.string().optional(),
  upstreamApi: safeUrlSchema.optional(),
});

const vulnerabilitySchema = z.object({
  id: z.string(),
  url: z.string(),
});

const remediationResponseSchema = z.object({
  id: z.string(),
  affectedDeviceGroups: z.array(deviceGroupSchema),
  upstreamApi: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  narrative: z.string().optional().nullable(),
  vulnerability: vulnerabilitySchema.optional().nullable(),
  user: userSchema,
  artifacts: z.array(artifactWrapperWithUrlsSchema),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type RemediationResponse = z.infer<typeof remediationResponseSchema>;

const paginatedRemediationResponseSchema = createPaginatedResponseSchema(
  remediationResponseSchema,
);

const createSearchFilter = (search: string) => {
  return search
    ? {
        OR: [
          { narrative: { contains: search, mode: "insensitive" as const } },
          {
            description: { contains: search, mode: "insensitive" as const },
          },
          {
            artifacts: {
              some: {
                latestArtifact: {
                  OR: [
                    {
                      name: { contains: search, mode: "insensitive" as const },
                    },
                    {
                      downloadUrl: {
                        contains: search,
                        mode: "insensitive" as const,
                      },
                    },
                  ],
                },
              },
            },
          },
        ],
      }
    : {};
};

const remediationVulnerabilitySelect = {
  select: {
    id: true,
    url: true,
  },
} as const;

const remediationInclude = {
  user: userIncludeSelect,
  vulnerability: remediationVulnerabilitySelect,
  affectedDeviceGroups: deviceGroupSelect,
  artifacts: artifactWrapperSelect,
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
      const searchFilter = createSearchFilter(search);

      const result = await fetchPaginated(prisma.remediation, input, {
        where: searchFilter,
        include: remediationInclude,
      });

      return {
        ...result,
        items: result.items.map(transformArtifactWrapper),
      };
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
      const where = { id: input.id };
      const result = await requireExistence(where, "remediation", remediationInclude);
      return transformArtifactWrapper(result);
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
      const { cpes, artifacts, ...dataInput } = input;
      const uniqueCpes = [...new Set(cpes)];
      const deviceGroups = await cpesToDeviceGroups(uniqueCpes);
      const userId = ctx.auth.user.id;

      // Verify the vulnerability exists
      if (input.vulnerabilityId) {
        const where = { id: input.vulnerabilityId };
        await requireExistence(where, "vulnerability");
      }

      // Create remediation with wrappers and initial artifacts in a transaction
      const result = await prisma.$transaction(async (tx) => {
        // Create the device artifact
        const remediation = await tx.remediation.create({
          data: {
            ...dataInput,
            affectedDeviceGroups: {
              connect: deviceGroups.map((dg) => ({ id: dg.id })),
            },
            userId,
          },
        });

        // Create a wrapper and artifact for each input artifact
        await createArtifactWrappers(
          tx,
          artifacts,
          remediation.id,
          "remediationId",
          userId,
        );

        // Fetch the complete remediation with includes
        return tx.remediation.findUniqueOrThrow({
          where: { id: remediation.id },
          include: remediationInclude,
        });
      });
      return transformArtifactWrapper(result);
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

      const result = await prisma.remediation.delete({
        where: { id: input.id },
        include: remediationInclude,
      });
      return transformArtifactWrapper(result);
    }),

  // PUT /api/remediations/{id} - Update remediation (only creator can update)
  update: protectedProcedure
    .input(remediationUpdateSchema)
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
      await requireOwnership(input.id, ctx.auth.user.id, "remediation");

      const { id, cpes, ...updateData } = input;

      // Prepare update data
      const data: Prisma.RemediationUpdateInput = {
        ...(updateData.narrative !== undefined && {
          narrative: updateData.narrative,
        }),
        ...(updateData.description !== undefined && {
          description: updateData.description,
        }),
        ...(updateData.upstreamApi !== undefined && {
          upstreamApi: updateData.upstreamApi,
        }),
        ...(updateData.vulnerabilityId !== undefined && {
          vulnerabilityId: updateData.vulnerabilityId,
        }),
      };

      // Handle CPE/device group update if provided
      if (cpes) {
        const uniqueCpes = [...new Set(cpes)];
        const deviceGroups = await cpesToDeviceGroups(uniqueCpes);
        data.affectedDeviceGroups = {
          set: deviceGroups.map((dg) => ({ id: dg.id })),
        };
      }

      const result = await prisma.remediation.update({
        where: { id },
        data,
        include: remediationInclude,
      });
      return transformArtifactWrapper(result);
    }),
});
