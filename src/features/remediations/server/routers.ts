import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { loadIntegrationContext } from "@/features/integrations/core/context";
import {
  commentsApiFor,
  inquiriesApiFor,
} from "@/features/integrations/core/registry";
import { processIntegrationSync } from "@/features/integrations/core/sync/upsert";
import {
  attachNote,
  attachNotes,
} from "@/features/notes/server/get-relevant-notes";
import {
  type AlohaStatus,
  type Prisma,
  ResourceType,
} from "@/generated/prisma";
import { inngest } from "@/inngest/client";
import prisma from "@/lib/db";
import { hospitalIdentifier } from "@/lib/hospital";
import { paginationInputSchema } from "@/lib/pagination";
import {
  cpesToMatchingConnect,
  createArtifactWrappers,
  fetchPaginated,
  processIntegrationToken,
  transformArtifactWrapper,
} from "@/lib/router-utils";
import { processArtifactHosting } from "@/lib/s3";
import { alohaInputSchema, integrationResponseSchema } from "@/lib/schemas";
import {
  baseProcedure,
  createTRPCRouter,
  protectedProcedure,
} from "@/trpc/init";
import { requireExistence, requireOwnership } from "@/trpc/middleware";
import {
  integrationRemediationInputSchema,
  paginatedRemediationResponseSchema,
  remediationAlohaResponseSchema,
  remediationInclude,
  remediationInputSchema,
  remediationResponseSchema,
  remediationUpdateSchema,
  remediationUploadResponseSchema,
} from "../types";

const createSearchFilter = (search: string) => {
  const insensitive = { contains: search, mode: "insensitive" as const };
  return search
    ? {
        OR: [
          { narrative: insensitive },
          { description: insensitive },
          {
            artifacts: {
              some: {
                latestArtifact: {
                  OR: [{ name: insensitive }, { downloadUrl: insensitive }],
                },
              },
            },
          },
        ],
      }
    : {};
};

/**
 * Find where this remediation lives on a platform that keeps comments.
 *
 * A remediation can be mirrored from more than one platform, and only some
 * platforms have a comment surface at all, so the first mapping whose module
 * declares one wins. Nothing here names a platform: the mapping says which one
 * it is, and the registry says what that platform can do.
 */

async function platformTargetFor(remediationId: string) {
  const mappings = await prisma.externalRemediationMapping.findMany({
    where: { itemId: remediationId },
    select: {
      externalId: true,
      integration: { select: { id: true, platform: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  for (const mapping of mappings) {
    const platform = mapping.integration.platform;
    const comments = commentsApiFor(platform, ResourceType.Remediation);
    const inquiries = inquiriesApiFor(platform, ResourceType.Remediation);
    if (comments || inquiries) {
      return {
        comments,
        inquiries,
        externalId: mapping.externalId,
        integrationId: mapping.integration.id,
      };
    }
  }
  return null;
}

export const remediationsRouter = createTRPCRouter({
  /**
   * Comments other hospitals left on this remediation, one page at a time.
   *
   * Returns an empty page rather than an error for a remediation no platform
   * keeps comments for, because "no comment surface" is a normal state and the
   * page renders the same either way.
   */
  /**
   * Questions this hospital put to the manufacturer about this remediation.
   *
   * Private by construction: the platform scopes inquiries to the token that
   * raised them, so this returns ours and never another consumer's.
   */
  getInquiries: protectedProcedure
    .input(
      z.object({
        remediationId: z.string(),
        cursor: z.string().nullish(),
      }),
    )
    .query(async ({ input }) => {
      const target = await platformTargetFor(input.remediationId);
      if (!target?.inquiries) {
        return { items: [], nextCursor: null, supported: false };
      }

      const platformCtx = await loadIntegrationContext(target.integrationId);
      const page = await target.inquiries.list(
        platformCtx,
        target.externalId,
        input.cursor,
      );
      return { ...page, supported: true };
    }),

  /**
   * Ask the manufacturer a question about this remediation.
   *
   * Attributed, unlike a comment: the platform knows which consumer asked,
   * because the answer has to come back to somebody. Nothing is recorded on our
   * side, since the platform already scopes the thread to us.
   */
  addInquiry: protectedProcedure
    .input(
      z.object({
        remediationId: z.string(),
        body: z.string().trim().min(1).max(10_000),
      }),
    )
    .mutation(async ({ input }) => {
      const target = await platformTargetFor(input.remediationId);
      if (!target?.inquiries) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This remediation has no platform that accepts inquiries.",
        });
      }

      const platformCtx = await loadIntegrationContext(target.integrationId);
      return target.inquiries.create(platformCtx, target.externalId, {
        body: input.body,
      });
    }),

  getComments: protectedProcedure
    .input(
      z.object({
        remediationId: z.string(),
        cursor: z.string().nullish(),
      }),
    )
    .query(async ({ input }) => {
      const target = await platformTargetFor(input.remediationId);
      if (!target?.comments) {
        return { items: [], nextCursor: null, supported: false };
      }

      const platformCtx = await loadIntegrationContext(target.integrationId);
      const page = await target.comments.list(
        platformCtx,
        target.externalId,
        input.cursor,
      );

      // The feed is deliberately anonymous, so the only way to know which
      // comments are ours is the pseudonym we recorded when one was posted.
      // Not scoped to the caller: every user here shares one author id, so a
      // colleague's comment is this hospital's too. Nothing in this query can
      // identify anybody outside it.
      const ours = await prisma.externalCommentIdentity.findMany({
        where: {
          remediationId: input.remediationId,
          integrationId: target.integrationId,
        },
        select: { pseudonym: true },
      });
      const ourPseudonyms = new Set(ours.map((row) => row.pseudonym));

      return {
        ...page,
        items: page.items.map((comment) => ({
          ...comment,
          fromYourHospital: ourPseudonyms.has(comment.pseudonym),
        })),
        supported: true,
      };
    }),

  /**
   * Post a comment to the platform, as this user.
   *
   * Posted under this deployment's hospital identifier, so MedISAO sees a
   * single voice rather than one per member of staff. Their API requires an
   * author field and refuses a blank one, but what actually identifies us is
   * the token: the realm secret behind the pseudonym is scoped to it.
   *
   * The row we write still records which user posted, because only this side
   * holds any mapping back to a person. That is coarser than it was: two
   * colleagues commenting on the same remediation share a pseudonym, so we can
   * say the hospital wrote a comment and when, but not which of them.
   */
  addComment: protectedProcedure
    .input(
      z.object({
        remediationId: z.string(),
        body: z.string().trim().min(1).max(10_000),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const target = await platformTargetFor(input.remediationId);
      if (!target?.comments) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This remediation has no platform that accepts comments.",
        });
      }

      const platformCtx = await loadIntegrationContext(target.integrationId);
      const comment = await target.comments.create(
        platformCtx,
        target.externalId,
        {
          body: input.body,
          authorExternalUserId: hospitalIdentifier(),
        },
      );

      // The platform derives the same pseudonym for this person on this record
      // every time, so an upsert keeps one row however often they comment.
      await prisma.externalCommentIdentity.upsert({
        where: {
          userId_remediationId_integrationId: {
            userId: ctx.auth.user.id,
            remediationId: input.remediationId,
            integrationId: target.integrationId,
          },
        },
        create: {
          userId: ctx.auth.user.id,
          remediationId: input.remediationId,
          integrationId: target.integrationId,
          pseudonym: comment.pseudonym,
        },
        update: { pseudonym: comment.pseudonym },
      });

      return { ...comment, fromYourHospital: true };
    }),

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
        items: await attachNotes(
          "REMEDIATION",
          result.items.map(transformArtifactWrapper),
        ),
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
      const found = transformArtifactWrapper(
        requireExistence(rem, "Remediation"),
      );
      return attachNote("REMEDIATION", found);
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
          `.trim(),
      },
    })
    .output(remediationUploadResponseSchema)
    .mutation(async ({ ctx, input }) => {
      const { artifacts, cpes, ...dataInput } = input;
      const userId = ctx.auth.user.id;
      const matchingConnect = cpes ? await cpesToMatchingConnect(cpes) : [];

      // Handle S3 upload URL -- if the user included a hash/size but no downloadUrl, they want us to host it
      const { processedArtifacts, uploadInstructions } =
        await processArtifactHosting(artifacts);

      // Verify the vulnerability exists
      if (input.vulnerabilityId) {
        const vuln = await prisma.vulnerability.findUnique({
          where: { id: input.vulnerabilityId },
        });
        requireExistence(vuln, "Vulnerability");
      }

      // Create remediation with wrappers and initial artifacts in a transaction
      const result = await prisma.$transaction(async (tx) => {
        // Create the device artifact
        const remediation = await tx.remediation.create({
          data: {
            ...dataInput,
            deviceGroupMatchings: { connect: matchingConnect },
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

      await inngest
        .send({
          name: "remediation/analysis.requested",
          data: { remediationId: result.id },
        })
        .catch((err) => {
          console.error("Failed to dispatch remediation analysis event:", err);
        });

      return {
        remediation: transformArtifactWrapper(result),
        uploadInstructions: uploadInstructions,
      };
    }),

  processIntegrationCreate: baseProcedure
    .input(integrationRemediationInputSchema)
    .meta({
      openapi: {
        method: "POST",
        path: "/remediations/integrationUpload/{token}",
        tags: ["Remediations"],
        summary: "Synchronize Remediations with integration",
        description:
          "Synchronize Remediations on VIPER from a partnered platform",
      },
    })
    .output(integrationResponseSchema)
    .mutation(async ({ input }) => {
      // Validate provided token or throw error
      const { userId, integrationId, resource } = await processIntegrationToken(
        input.token,
        ResourceType.Remediation,
      );

      return processIntegrationSync(
        prisma,
        {
          model: prisma.remediation,
          mappingModel: prisma.externalRemediationMapping,
          transformInputItem: async (item, userId) => {
            const {
              vendorId: _vendorId,
              artifacts,
              cpes,
              upstreamApi: _upstreamApi,
              webUrl: _webUrl,
              ...itemData
            } = item;
            const matchingConnect = cpes
              ? await cpesToMatchingConnect(cpes)
              : [];

            return {
              createData: {
                ...itemData,
                userId,
                deviceGroupMatchings: { connect: matchingConnect },
              },
              updateData: {
                ...itemData,
                // Only replace matchings when CPEs were provided; omitting them
                // on re-sync must not clear a remediation's existing matchings.
                ...(cpes
                  ? { deviceGroupMatchings: { set: matchingConnect } }
                  : {}),
              },
              uniqueFieldConditions: [],
              artifactsData: {
                artifacts,
                artifactWrapperParentField: "remediationId",
              },
            };
          },
        },
        input,
        userId,
        integrationId,
        resource,
      );
    }),

  // GET /api/remediations/{id}/aloha - Get aloha data for a remediation
  getAloha: protectedProcedure
    .input(z.object({ id: z.string() }))
    .meta({
      openapi: {
        method: "GET",
        path: "/remediations/{id}/aloha",
        tags: ["Remediations"],
        summary: "Get Remediation Aloha",
        description:
          "Get aloha status and log for a remediation. Any authenticated user can access.",
      },
    })
    .output(remediationAlohaResponseSchema)
    .query(async ({ input }) => {
      const rem = await prisma.remediation.findUnique({
        where: { id: input.id },
        include: remediationInclude,
      });
      const found = requireExistence(rem, "Remediation");
      return {
        remediation: transformArtifactWrapper(found),
        aloha: { status: found.alohaStatus, log: found.alohaLog },
      };
    }),

  // PUT /api/remediations/{id}/aloha - Update aloha data for a remediation
  updateAloha: protectedProcedure
    .input(z.object({ id: z.string(), data: alohaInputSchema }))
    .meta({
      openapi: {
        method: "PUT",
        path: "/remediations/{id}/aloha",
        tags: ["Remediations"],
        summary: "Update Remediation Aloha",
        description:
          "Update aloha status and log for a remediation. Any authenticated user can update.",
      },
    })
    .output(remediationAlohaResponseSchema)
    .mutation(async ({ input }) => {
      const existing = await prisma.remediation.findUnique({
        where: { id: input.id },
        select: { id: true },
      });
      requireExistence(existing, "Remediation");

      const rem = await prisma.remediation.update({
        where: { id: input.id },
        data: {
          alohaStatus: input.data.status as AlohaStatus,
          alohaLog: input.data.log ?? {},
        },
        include: remediationInclude,
      });
      return {
        remediation: transformArtifactWrapper(rem),
        aloha: { status: rem.alohaStatus, log: rem.alohaLog },
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
          `.trim(),
      },
    })
    .output(remediationUploadResponseSchema)
    .mutation(async ({ ctx, input }) => {
      // Verify ownership and get current data
      await requireOwnership(input.id, ctx.auth.user.id, "remediation");

      const { id, artifacts = [], ...updateData } = input;

      // Prepare update data
      const { processedArtifacts, uploadInstructions } =
        await processArtifactHosting(artifacts);

      const result = await prisma.$transaction(async (tx) => {
        const data: Prisma.RemediationUpdateInput = {
          ...(updateData.narrative !== undefined && {
            narrative: updateData.narrative,
          }),
          ...(updateData.description !== undefined && {
            description: updateData.description,
          }),
          ...(updateData.vulnerabilityId !== undefined && {
            vulnerabilityId: updateData.vulnerabilityId,
          }),
        };

        // Replace matchings when CPEs are provided.
        if (updateData.cpes) {
          data.deviceGroupMatchings = {
            set: await cpesToMatchingConnect(updateData.cpes),
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
            ctx.auth.user.id,
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
