import "server-only";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { AuthType, type Prisma, ResourceType } from "@/generated/prisma";
import { inngest } from "@/inngest/client";
import prisma from "@/lib/db";
import { paginationInputSchema } from "@/lib/pagination";
import { fetchPaginated } from "@/lib/router-utils";
import { createTRPCRouter, protectedProcedure } from "@/trpc/init";
import {
  authCredentialSchema,
  encodeAuthCredential,
} from "../core/credentials";
import { defaultSyncEveryFor, requirePlatform } from "../core/registry";
import { effectiveSyncEvery } from "../core/sync/cadence";
import { resourcesFor } from "../core/sync/resources";
import type { AnyConnectorModule } from "../core/types";
import { type IntegrationFormValues, integrationInputSchema } from "../types";

/** Encrypted credentials must never reach the browser. */
const omitCredentials = { credentials: true } as const;

const integrationsInclude = {
  resourceSyncs: {
    select: {
      integrationId: true,
      resource: true,
      status: true,
      errorMessage: true,
      lastSuccessfulSync: true,
      nextSyncAt: true,
      enabled: true,
      syncEvery: true,
    },
    orderBy: {
      resource: "asc", // stable ordering; one row per resource
    },
  },
} as const;

const integrationListSelect = {
  id: true,
  name: true,
  platform: true,
  syncEvery: true,
  enabled: true,
  resourceSyncs: integrationsInclude.resourceSyncs,
} as const satisfies Prisma.IntegrationSelect;

type IntegrationListRow = Prisma.IntegrationGetPayload<{
  select: typeof integrationListSelect;
}>;

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

/**
 * Validate credentials against the platform's own schema, then encode them with
 * the shared one.
 */
const toCredentialBlob = (
  module: AnyConnectorModule,
  credentials: IntegrationFormValues["credentials"],
) => {
  if (!credentials) return null;
  module.definition.credentialSchema.parse(credentials);
  return encodeAuthCredential(authCredentialSchema.parse(credentials));
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
  if (data.credentials.authType === AuthType.None) return { credentials: null };
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
  // intentionally fetches all integrations, not just user's — one unified
  // list across every resource type, for the enabled-integrations table.
  getMany: protectedProcedure
    .input(paginationInputSchema)
    .query(async ({ input }) => {
      const where = {
        name: {
          contains: input.search,
          mode: "insensitive" as const,
        },
      };

      const result = await fetchPaginated(prisma.integration, input, {
        where,
        select: integrationListSelect,
      });

      // Add each resource sync's resolved cadence, plus whether that's the
      // platform's own default or an operator override — at either the
      // resource or the integration level. The table can't tell the two
      // apart from `syncEvery` alone (a nested resource row never sees its
      // parent integration's `syncEvery`).
      const now = new Date();
      const items = (result.items as IntegrationListRow[]).map(
        ({ syncEvery, ...integration }) => ({
          ...integration,
          resourceSyncs: integration.resourceSyncs.map((sync) => ({
            ...sync,
            isOverridden: sync.syncEvery !== null || syncEvery !== null,
            effectiveSyncEvery: effectiveSyncEvery(
              sync.syncEvery,
              syncEvery,
              defaultSyncEveryFor(integration.platform, sync.resource),
            ),
            // Same "due" check the cron uses, computed against the server's
            // clock rather than the browser's.
            isDue: sync.nextSyncAt !== null && sync.nextSyncAt <= now,
          })),
        }),
      );

      return { ...result, items };
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
      return prisma.integration.delete({
        where: { id: input.id },
        omit: omitCredentials,
      });
    }),

  // Operator kill switch for the whole integration — distinct from `update`,
  // which requires a full (and platform-validated) config/credentials payload.
  setEnabled: protectedProcedure
    .input(z.object({ id: z.string(), enabled: z.boolean() }))
    .mutation(async ({ input }) => {
      // Caller just invalidates and refetches getMany — no need to shape a
      // full response here, same as `remove` below.
      return prisma.integration.update({
        where: { id: input.id },
        data: { enabled: input.enabled },
        omit: omitCredentials,
      });
    }),

  // Same, but for one resource on a multi-resource integration (e.g. turn off
  // work orders, keep assets syncing).
  setResourceSyncEnabled: protectedProcedure
    .input(
      z.object({
        integrationId: z.string(),
        resource: z.enum(ResourceType),
        enabled: z.boolean(),
      }),
    )
    .mutation(async ({ input }) => {
      return prisma.integrationResourceSync.update({
        where: {
          integrationId_resource: {
            integrationId: input.integrationId,
            resource: input.resource,
          },
        },
        data: { enabled: input.enabled },
      });
    }),

  triggerSync: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      // any user can trigger any integration
      // but if we change so later, implement that here
      const integration = await prisma.integration.findFirst({
        where: { id: input.id, enabled: true },
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
