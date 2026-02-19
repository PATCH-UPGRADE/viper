import { TRPCError } from "@trpc/server";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma";
import prisma from "@/lib/db";
import { paginationInputSchema } from "@/lib/pagination";
import {
  cpesToDeviceGroups,
  createArtifactWrappers,
  fetchPaginated,
  transformArtifactWrapper,
} from "@/lib/router-utils";
import { createTRPCRouter, protectedProcedure } from "@/trpc/init";
import { requireExistence, requireOwnership } from "@/trpc/middleware";
import {
  paginatedRemediationResponseSchema,
  remediationInclude,
  remediationInputSchema,
  remediationResponseSchema,
  remediationUpdateSchema,
  remediationUploadResponseSchema,
} from "../types";
import { processArtifactHosting } from "@/lib/s3";

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
      const rem = await prisma.remediation.findUnique({
        where: { id: input.id },
        include: remediationInclude,
      });
      return transformArtifactWrapper(requireExistence(rem, "Remediation"));
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
        description: `
          Create a new remediation. The authenticated user will be recorded as the creator. 
          
          **Artifact hosting**
          See docs/upload_artifact.md
          `.trim()
      },
    })
    .output(remediationUploadResponseSchema)
    .mutation(async ({ ctx, input }) => {
      const { cpes, artifacts, ...dataInput } = input;
      const uniqueCpes = [...new Set(cpes)];
      const deviceGroups = await cpesToDeviceGroups(uniqueCpes);
      const userId = ctx.auth.user.id;
      
      // Handle S3 URL -- if the user included a hash/size but no downloadUrl, they want us to host it
      const { processedArtifacts, uploadInstructions } = await processArtifactHosting(artifacts);

      // Verify the vulnerability exists
      if (input.vulnerabilityId) {
        const vuln = await prisma.vulnerability.findUnique({
          where: { id: input.vulnerabilityId },
        });
        if (!vuln) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Vulnerability not found",
          });
        }
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
          processedArtifacts,
          remediation.id,
          "remediationId",
          userId,
        );

        // Fetch the complete remediation with includes
        return await tx.remediation.findUniqueOrThrow({
          where: { id: remediation.id },
          include: remediationInclude,
        });
      });

      return {
        remediation: transformArtifactWrapper(result),
        uploadInstructions: uploadInstructions,
      };
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
        description: `
          Update a remediation. Only the user who created the remediation can update it. 
          
          **Artifact hosting**
          See docs/upload_artifact.md
          `.trim()
      },
    })
    .output(remediationUploadResponseSchema)
    .mutation(async ({ ctx, input }) => {
      // Verify ownership and get current data
      await requireOwnership(input.id, ctx.auth.user.id, "remediation");

      const { id, cpes, artifacts = [], ...updateData } = input;

      // Prepare update data
      const { processedArtifacts, uploadInstructions } = await processArtifactHosting(artifacts);

      const result = await prisma.$transaction(async (tx) => {

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

        await tx.remediation.update({
          where: { id },
          data,
        });

        if (processedArtifacts.length > 0) {
          await createArtifactWrappers(
            tx,
            processedArtifacts,
            id,
            "remediationId",
            ctx.auth.user.id
          );
        }

        return await tx.remediation.findUniqueOrThrow({
          where: { id },
          include: remediationInclude,
        });
      });
    return {
      remediation: transformArtifactWrapper(result),
      uploadInstructions,
    };
  }),
});
