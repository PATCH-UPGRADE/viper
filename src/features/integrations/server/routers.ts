import "server-only";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { AuthType, ResourceType } from "@/generated/prisma";
import { inngest } from "@/inngest/client";
import prisma from "@/lib/db";
import { paginationInputSchema } from "@/lib/pagination";
import { fetchPaginated } from "@/lib/router-utils";
import { userIncludeSelect } from "@/lib/schemas";
import { createTRPCRouter, protectedProcedure } from "@/trpc/init";
import type { AuthCredential } from "../core/credentials";
import { encryptCredentials, usesGenericAuth } from "../core/credentials";
import { requirePlatform } from "../core/registry";
import { resourcesFor } from "../core/sync/resources";
import type { AnyConnectorModule } from "../core/types";
import type { IntegrationFormValues } from "../types";
import { integrationInputSchema } from "../types";

const paginatedIntegrationsInputSchema = paginationInputSchema.extend({
  resourceType: z.enum(Object.values(ResourceType)),
});

const integrationsInclude = {
  user: userIncludeSelect,
  resourceSyncs: {
    select: {
      resource: true,
      status: true,
      errorMessage: true,
      lastAttemptAt: true,
      lastSuccessfulSync: true,
      nextSyncAt: true,
      enabled: true,
    },
    orderBy: {
      resource: "asc", // stable ordering; one row per resource
    },
  },
  _count: {
    select: {
      assetMappings: true,
      deviceArtifactMappings: true,
      remediationMappings: true,
      vulnerabilityMappings: true,
    },
  },
} as const;

/**
 * Encrypted credentials must never reach the browser
 */
const omitCredentials = { credentials: true } as const;

/**
 * The input carries `config` as opaque JSON which makes the platform module the one and
 * only validator.
 */
const toRowShape = (input: IntegrationFormValues) => {
  const module = requirePlatform(input.platform);
  const { definition } = module;

  const config = definition.configSchema.parse(input.config);

  return {
    row: {
      name: input.name,
      platform: input.platform,
      syncEvery: input.syncEvery,
      config,
    },
    module,
    config,
  };
};

/** AuthType.None means "nothing to protect" only for generic-auth platforms. */
const toCredentialBlob = (
  module: AnyConnectorModule,
  credentials: IntegrationFormValues["credentials"],
) => {
  if (!credentials) return null;
  const parsed = module.definition.credentialSchema.parse(credentials);
  const isNoneAuth =
    usesGenericAuth(module.definition.credentialSchema) &&
    (parsed as AuthCredential).authType === AuthType.None;
  return isNoneAuth ? null : encryptCredentials(parsed);
};

/**
 * What an edit should do to the stored credentials.
 *
 * The form cannot prefill them (encrypted, and not returned to the client), so
 * omitting the whole `credentials` object means "keep what is stored". Sending
 * `AuthType.None` is therefore the *only* way to clear them — without that
 * branch, switching from Bearer back to None would leave the old token on the row.
 */
const credentialsPatch = (
  module: AnyConnectorModule,
  data: IntegrationFormValues,
) => {
  if (!data.credentials) return {};
  return { credentials: toCredentialBlob(module, data.credentials) };
};

/**
 * Surface a rejected platform (no module registered) or a config that its
 * platform won't accept as a 400, not a 500 — both are the caller's problem.
 */
const asBadRequest = <T>(fn: () => T): T => {
  try {
    return fn();
  } catch (error) {
    if (error instanceof TRPCError) throw error;
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: error instanceof Error ? error.message : "Invalid integration",
    });
  }
};

export const integrationsRouter = createTRPCRouter({
  // intentionally fetches all integrations, not just user's
  getMany: protectedProcedure
    .input(paginatedIntegrationsInputSchema)
    .query(async ({ input }) => {
      const { search, resourceType } = input;

      // An integration is "for" a resource if it has a sync row for it
      const whereFilter = {
        resourceSyncs: { some: { resource: resourceType } },
        name: {
          contains: search,
          mode: "insensitive" as const,
        },
      };

      return fetchPaginated(prisma.integration, input, {
        where: whereFilter,
        include: integrationsInclude,
        omit: omitCredentials,
      });
    }),

  create: protectedProcedure
    .input(integrationInputSchema)
    .mutation(async ({ ctx, input }) => {
      const { name } = input;
      const { row, module, config } = asBadRequest(() => toRowShape(input));
      const credentials = asBadRequest(() =>
        toCredentialBlob(module, input.credentials),
      );
      // For a generic platform this is exactly [config.resource]
      const resources = asBadRequest(() => resourcesFor(module, config));

      const integration = await prisma.$transaction(async (tx) => {
        const integrationUser = await tx.user.create({
          data: {
            id: crypto.randomUUID(),
            name,
          },
        });

        return tx.integration.create({
          data: {
            ...row,
            credentials,
            userId: ctx.auth.user.id,
            integrationUserId: integrationUser.id,
            resourceSyncs: {
              // nextSyncAt stays null => due on the next cron tick.
              create: resources.map((resource) => ({ resource })),
            },
            apiKeyConnector: {
              // ApiKeyConnector is still single-resource (TODO VW-435); a
              // multi-resource platform gets the first of its resources here.
              create: {
                name,
                resourceType: resources[0],
                userId: ctx.auth.user.id,
              },
            },
          },
          include: integrationsInclude,
          omit: omitCredentials,
        });
      });
      try {
        await module.onCreate?.();
      } catch (err) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: err instanceof Error ? err.message : "Invalid integration",
        });
      }
      return integration;
    }),

  // any user can intentionally update any integration
  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        data: integrationInputSchema,
      }),
    )
    .mutation(async ({ input }) => {
      const { id, data } = input;
      const { row, module, config } = asBadRequest(() => toRowShape(data));
      const credentials = asBadRequest(() => credentialsPatch(module, data));
      const resources = asBadRequest(() => resourcesFor(module, config));

      return prisma.$transaction(async (tx) => {
        const integration = await tx.integration.update({
          where: { id },
          data: {
            ...row,
            // TODO(VW-449): credentials are encrypted bytes and are not
            // returned to the client, so the edit form cannot prefill them.
            // Submitting with the auth fields blank therefore means "keep what
            // is stored" rather than "clear it" — otherwise every edit would
            // silently wipe the credential. Needs a real UI affordance
            // ("Credentials stored — leave blank to keep") before this ships.
            ...credentials,
            resourceSyncs: {
              // Rows are never deleted, so cursors survive a switch away and
              // back. `enabled` is what decides whether the cron and
              // `triggerSync` still pick them up. The two writes touch
              // disjoint rows, so their order doesn't matter.
              updateMany: {
                where: { resource: { notIn: resources } },
                data: { enabled: false },
              },
              upsert: resources.map((resource) => ({
                where: {
                  integrationId_resource: { integrationId: id, resource },
                },
                create: { resource },
                update: { enabled: true },
              })),
            },
          },
          include: integrationsInclude,
          omit: omitCredentials,
        });

        // If integration has a linked user, update their name
        if (integration.integrationUserId && data.name) {
          await tx.user.update({
            where: { id: integration.integrationUserId },
            data: {
              name: data.name,
            },
          });
        }

        return integration;
      });
    }),

  // any user can intentionally remove any integration
  remove: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      const existing = await prisma.integration.findUnique({
        where: { id: input.id },
        select: { resourceSyncs: { select: { resource: true } } },
      });

      const deleted = await prisma.integration.delete({
        where: { id: input.id },
        omit: omitCredentials,
      });

      return {
        ...deleted,
        resources: existing?.resourceSyncs.map((s) => s.resource) ?? [],
      };
    }),

  triggerSync: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      // any user can trigger any integration
      // but if we change so later, implement that here
      const integration = await prisma.integration.findFirst({
        where: { id: input.id },
        select: {
          id: true,
          // Same filter the cron uses: a resource the operator switched off
          // shouldn't sync just because someone hit the button.
          resourceSyncs: {
            where: { enabled: true },
            select: { resource: true },
          },
        },
      });
      if (!integration) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      await Promise.all(
        integration.resourceSyncs.map((sync) =>
          inngest.send({
            name: "integration/sync.requested",
            data: { integrationId: input.id, resource: sync.resource },
          }),
        ),
      );

      return { success: true };
    }),
});
