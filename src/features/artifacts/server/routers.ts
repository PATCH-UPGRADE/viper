import { z } from "zod";
import type { Prisma } from "@/generated/prisma";
import prisma from "@/lib/db";
import { paginationInputSchema } from "@/lib/pagination";
import { fetchPaginated } from "@/lib/router-utils";
import { createTRPCRouter, protectedProcedure } from "@/trpc/init";
import { requireOwnership } from "@/trpc/middleware";
import {
  artifactUpdateSchema,
  artifactWithUrlsSchema,
  createArtifactVersionSchema,
  paginatedArtifactResponseSchema,
} from "../types";

export const artifactsRouter = createTRPCRouter({
  // GET /api/artifacts/versions/{wrapperId} - List all versions in a wrapper
  listVersions: protectedProcedure
    .input(
      paginationInputSchema.extend({
        wrapperId: z.string(),
      }),
    )
    .meta({
      openapi: {
        method: "GET",
        path: "/artifacts/versions/{wrapperId}",
        tags: ["Artifacts"],
        summary: "List all versions of an artifact",
        description:
          "Get all versions of an artifact, ordered by version number.",
      },
    })
    .output(paginatedArtifactResponseSchema)
    .query(async ({ input }) => {
      return fetchPaginated(prisma.artifact, input, {
        where: { wrapperId: input.wrapperId },
      });
    }),

  // GET /api/artifacts/{id} - Get single artifact
  getOne: protectedProcedure
    .input(z.object({ id: z.string() }))
    .meta({
      openapi: {
        method: "GET",
        path: "/artifacts/{id}",
        tags: ["Artifacts"],
        summary: "Get artifact",
        description: "Get a single artifact by ID.",
      },
    })
    .output(artifactWithUrlsSchema)
    .query(async ({ input }) => {
      return prisma.artifact.findUniqueOrThrow({
        where: { id: input.id },
      });
    }),

  // PUT /api/artifacts/{id} - Update artifact metadata
  update: protectedProcedure
    .input(artifactUpdateSchema)
    .meta({
      openapi: {
        method: "PUT",
        path: "/artifacts/{id}",
        tags: ["Artifacts"],
        summary: "Update artifact",
        description:
          "Update artifact metadata (name, artifactType, size only). Only the user who created the artifact can update it.",
      },
    })
    .output(artifactWithUrlsSchema)
    .mutation(async ({ ctx, input }) => {
      const { id, ...updateData } = input;

      await requireOwnership(input.id, ctx.auth.user.id, "artifact");

      // Prepare update data
      const data: Prisma.ArtifactUpdateInput = {
        ...(updateData.name !== undefined && {
          name: updateData.name,
        }),
        ...(updateData.artifactType !== undefined && {
          artifactType: updateData.artifactType,
        }),
        ...(updateData.size !== undefined && {
          size: updateData.size,
        }),
      };

      return prisma.artifact.update({
        where: { id },
        data,
      });
    }),

  // POST /api/artifacts/versions/{wrapperId} - Create new version
  createVersion: protectedProcedure
    .input(createArtifactVersionSchema)
    .meta({
      openapi: {
        method: "POST",
        path: "/artifacts/versions/{wrapperId}",
        tags: ["Artifacts"],
        summary: "Create artifact version",
        description:
          "Upload a new artifact version, which becomes the latest artifact. Updates version chain pointers accordingly.",
      },
    })
    .output(artifactWithUrlsSchema)
    .mutation(async ({ ctx, input }) => {
      const { wrapperId, ...artifactData } = input;
      const userId = ctx.auth.user.id;

      await requireOwnership(wrapperId, ctx.auth.user.id, "artifactWrapper");

      return prisma.$transaction(async (tx) => {
        // Get the wrapper with current latest artifact
        const wrapper = await tx.artifactWrapper.findUniqueOrThrow({
          where: { id: wrapperId },
          include: {
            latestArtifact: true,
          },
        });

        const currentLatest = wrapper.latestArtifact;
        const nextVersion = currentLatest ? currentLatest.versionNumber + 1 : 1;

        // Create new artifact version
        const newArtifact = await tx.artifact.create({
          data: {
            wrapperId,
            name: artifactData.name || null,
            artifactType: artifactData.artifactType,
            downloadUrl: artifactData.downloadUrl || null,
            size: artifactData.size || null,
            versionNumber: nextVersion,
            prevVersionId: currentLatest?.id || null,
            userId,
          },
        });

        // Update wrapper to point to new artifact as latest
        await tx.artifactWrapper.update({
          where: { id: wrapperId },
          data: { latestArtifactId: newArtifact.id },
        });

        return newArtifact;
      });
    }),
});
