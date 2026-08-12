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
import {
  authCredentialSchema,
  encodeAuthCredential,
} from "../core/credentials";
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
 * Encrypted credentials must never reach the browser. Prisma returns every
 * scalar by default and `include` only *adds* relations, so without this the
 * ciphertext ships on each integrations page load.
 */
const omitCredentials = { credentials: true } as const;

/**
 * The form is flat; the row is not. Derive `config` from the submitted values
 * and hand it to the platform's own `configSchema`, so an unknown or missing
 * key fails at write time rather than at the first sync.
 *
 * The wire shape is unchanged — `integrationInputSchema` is still exactly what
 * a client posts. Only the derivation moved into the platform module.
 */
const toRowShape = (input: IntegrationFormValues) => {
  const module = requirePlatform(input.platform);
  const { definition } = module;

  const config = definition.configSchema.parse({
    integrationUri: input.integrationUri,
    resource: input.resource,
    ...(input.additionalInstructions
      ? { additionalInstructions: input.additionalInstructions }
      : {}),
  });

  // The connection-level rate-limit floor, enforced when the operator saves —
  // before any resource is in scope, which is why it lives on the definition.
  if (definition.minSyncEvery && input.syncEvery < definition.minSyncEvery) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `${definition.displayName} requires a sync interval of at least ${definition.minSyncEvery}s.`,
    });
  }

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

/**
 * Validate credentials against the platform's own schema, then encode them with
 * the shared one.
 *
 * The double parse is deliberate: `credentialSchema` is a `z.ZodType<TCreds>`
 * with `TCreds` erased in the registry, so its output isn't assignable to
 * `encodeAuthCredential`'s `AuthCredential`. The platform schema is the gate;
 * `authCredentialSchema` is the storage shape.
 */
const toCredentialBlob = (
  module: AnyConnectorModule,
  input: { authType: AuthType; authentication?: unknown },
) => {
  module.definition.credentialSchema.parse(input);
  return encodeAuthCredential(authCredentialSchema.parse(input));
};

/**
 * What an edit should do to the stored credentials.
 *
 * The form cannot prefill them (encrypted, and not returned to the client), so
 * a blank auth section means "keep what is stored". Selecting AuthType.None is
 * therefore the *only* way to clear them — without that branch, switching an
 * integration from Bearer back to None would leave the old token on the row.
 */
const credentialsPatch = (
  module: AnyConnectorModule,
  data: IntegrationFormValues,
) => {
  if (data.authType === AuthType.None) return { credentials: null };
  if (data.authentication) {
    return {
      credentials: toCredentialBlob(module, {
        authType: data.authType,
        authentication: data.authentication,
      }),
    };
  }
  return {};
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

      // An integration is "for" a resource if it has a sync row for it. Under
      // the old schema this was a scalar column; a code-defined platform can
      // now serve several resources from one row.
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
      const { name, authType, authentication } = input;
      const { row, module, config } = asBadRequest(() => toRowShape(input));
      const credentials = asBadRequest(() =>
        toCredentialBlob(module, { authType, authentication }),
      );
      // For a generic platform this is exactly [input.resource]; a code-defined
      // platform can serve several resources from one row.
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
              create: {
                name,
                resourceType: input.resource,
                userId: ctx.auth.user.id,
              },
            },
          },
          include: integrationsInclude,
          omit: omitCredentials,
        });
      });
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
            // TODO(VW-427): credentials are encrypted bytes and are not
            // returned to the client, so the edit form cannot prefill them.
            // Submitting with the auth fields blank therefore means "keep what
            // is stored" rather than "clear it" — otherwise every edit would
            // silently wipe the credential. Needs a real UI affordance
            // ("Credentials stored — leave blank to keep") before this ships.
            ...credentials,
            resourceSyncs: {
              // Adds rows if the operator switched resource; leaves any
              // existing rows (and their cursors) alone.
              upsert: resources.map((resource) => ({
                where: {
                  integrationId_resource: { integrationId: id, resource },
                },
                create: { resource },
                update: {},
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
      // Read the resources before the delete: Prisma's `delete` returns scalars
      // only, and the client's cache invalidation keys off the resource.
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
        select: { id: true, resourceSyncs: { select: { resource: true } } },
      });
      if (!integration) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      // The unit of work is (integration, resource), so a manual sync fans out
      // the same way the cron does.
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
