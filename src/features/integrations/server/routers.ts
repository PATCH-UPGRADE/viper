import "server-only";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { AuthType, type Prisma, ResourceType } from "@/generated/prisma";
import { inngest } from "@/inngest/client";
import prisma from "@/lib/db";
import { paginationInputSchema } from "@/lib/pagination";
import { fetchPaginated } from "@/lib/router-utils";
import { createTRPCRouter, protectedProcedure } from "@/trpc/init";
import { requireExistence } from "@/trpc/middleware";
import type { AuthCredential } from "../core/credentials";
import {
  decryptCredentials,
  encryptCredentials,
  usesGenericAuth,
} from "../core/credentials";
import {
  categoriesFor,
  defaultSyncEveryFor,
  displayNameFor,
  requirePlatform,
} from "../core/registry";
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
      lastAttemptAt: true,
      lastSuccessfulSync: true,
      nextSyncAt: true,
      enabled: true,
      syncEvery: true,
    },
    orderBy: {
      resource: "asc",
    },
  },
} as const;

const integrationListSelect = {
  id: true,
  name: true,
  platform: true,
  syncEvery: true,
  config: true,
  enabled: true,
  resourceSyncs: integrationsInclude.resourceSyncs,
} as const satisfies Prisma.IntegrationSelect;

type IntegrationListRow = Prisma.IntegrationGetPayload<{
  select: typeof integrationListSelect;
}>;

const toRowShape = (input: IntegrationFormValues) => {
  const module = requirePlatform(input.platform);
  const { definition } = module;

  const config = definition.configSchema.parse(input.config);

  return {
    row: {
      name: input.name,
      platform: input.platform,
      // Omitted means "keep what is stored" (null = inherit the platform
      // default) — same reasoning as credentials below.
      ...(input.syncEvery !== undefined && { syncEvery: input.syncEvery }),
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

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * Merges a client-submitted partial credential patch into the existing
 * decrypted value, one level deep — no platform/auth-shaped branching.
 *
 * A discriminator change is the one exception: if `partial.authType`
 * differs from what's actually stored, the old `authentication` object is
 * for the wrong auth type — `authenticationSchema` is a union with no
 * cross-check against `authType`, so carrying old fields across a switch
 * would validate against the *previous* variant's shape instead of
 * requiring the new one's, even though the two are unrelated shapes.
 */
export const mergeCredentialPatch = (
  existing: unknown,
  partial: Record<string, unknown>,
): Record<string, unknown> => {
  const base = isPlainObject(existing) ? existing : {};
  const discriminatorChanged =
    "authType" in partial && partial.authType !== base.authType;
  const mergeBase = discriminatorChanged
    ? { ...base, authentication: undefined }
    : base;

  const merged: Record<string, unknown> = { ...mergeBase };
  for (const [key, value] of Object.entries(partial)) {
    const baseValue = mergeBase[key];
    merged[key] =
      isPlainObject(value) && isPlainObject(baseValue)
        ? { ...baseValue, ...value }
        : value;
  }
  return merged;
};

/**
 * `credentials` omitted means keep what's stored; present means decrypt it,
 * merge the patch in, then validate+encrypt the result like `create` does.
 *
 * Takes the already-fetched blob rather than fetching it itself: the fetch
 * is I/O, kept outside `asBadRequest` (reserved elsewhere in this file for
 * input-validation failures) so a transient DB error surfaces as a server
 * error, not a 400.
 */
const credentialsPatch = (
  module: AnyConnectorModule,
  data: IntegrationFormValues,
  existingBlob: Uint8Array | null,
) => {
  if (!data.credentials) return {};
  const existing = existingBlob ? decryptCredentials(existingBlob) : null;
  const merged = mergeCredentialPatch(existing, data.credentials);
  return { credentials: toCredentialBlob(module, merged) };
};

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

const requireIntegration = async (id: string) => {
  const existing = await prisma.integration.findUnique({
    where: { id },
    select: { id: true },
  });
  requireExistence(existing, "Integration");
};

export const integrationsRouter = createTRPCRouter({
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

      const now = new Date();
      const items = (result.items as IntegrationListRow[]).map(
        (integration) => ({
          ...integration,
          platformLabel: displayNameFor(integration.platform),
          categories: categoriesFor(integration.platform),
          resourceSyncs: integration.resourceSyncs.map((sync) => ({
            ...sync,
            // A nested resource row never sees its parent integration's
            // `syncEvery`, so the table can't tell "resource override" from
            // "integration-level override" apart from `syncEvery` alone.
            isOverridden:
              sync.syncEvery !== null || integration.syncEvery !== null,
            effectiveSyncEvery: effectiveSyncEvery(
              sync.syncEvery,
              integration.syncEvery,
              defaultSyncEveryFor(integration.platform, sync.resource),
            ),
            // Same "due" check the cron uses, against the server's clock.
            isDue: sync.nextSyncAt === null || sync.nextSyncAt <= now,
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
              create: resources.map((resource) => ({ resource })),
            },
            apiKeyConnector: {
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

  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        data: integrationInputSchema,
      }),
    )
    .mutation(async ({ input }) => {
      const { id, data } = input;
      // Two independent reads of the same row (existence check, credentials
      // for the merge) — run them concurrently rather than round-tripping
      // twice in sequence.
      const [, existingRow] = await Promise.all([
        requireIntegration(id),
        data.credentials
          ? prisma.integration.findUnique({
              where: { id },
              select: { credentials: true },
            })
          : null,
      ]);
      const { row, module, config } = asBadRequest(() => toRowShape(data));
      const credentials = asBadRequest(() =>
        credentialsPatch(module, data, existingRow?.credentials ?? null),
      );
      const resources = asBadRequest(() => resourcesFor(module, config));

      return prisma.$transaction(async (tx) => {
        const integration = await tx.integration.update({
          where: { id },
          data: {
            ...row,
            // `credentials` omitted means "keep the stored value" —
            // credentialsPatch returns {} so this spreads nothing. Present
            // means "apply this (already merged) patch".
            ...credentials,
            resourceSyncs: {
              updateMany: {
                where: { resource: { notIn: resources } },
                data: { enabled: false },
              },
              upsert: resources.map((resource) => ({
                where: {
                  integrationId_resource: { integrationId: id, resource },
                },
                // A resource newly implied by config starts enabled (schema
                // default); an existing row's enabled flag is the user's own
                // toggle (setResourceSyncEnabled) and must not be reset here.
                create: { resource },
                update: {},
              })),
            },
          },
          include: integrationsInclude,
          omit: omitCredentials,
        });

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

  remove: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      await requireIntegration(input.id);
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
      await requireIntegration(input.id);
      return prisma.integration.update({
        where: { id: input.id },
        data: { enabled: input.enabled },
        omit: omitCredentials,
      });
    }),

  setResourceSyncEnabled: protectedProcedure
    .input(
      z.object({
        integrationId: z.string(),
        resource: z.enum(ResourceType),
        enabled: z.boolean(),
      }),
    )
    .mutation(async ({ input }) => {
      const where = {
        integrationId_resource: {
          integrationId: input.integrationId,
          resource: input.resource,
        },
      };
      const existing = await prisma.integrationResourceSync.findUnique({
        where,
        select: { integrationId: true },
      });
      requireExistence(existing, "Resource sync");
      return prisma.integrationResourceSync.update({
        where,
        data: { enabled: input.enabled },
      });
    }),

  triggerSync: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      const integration = await prisma.integration.findFirst({
        where: { id: input.id, enabled: true },
        select: {
          id: true,
          resourceSyncs: {
            where: { enabled: true },
            select: { resource: true },
          },
        },
      });
      if (!integration) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      if (integration.resourceSyncs.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "No enabled resources to sync",
        });
      }

      await inngest.send(
        integration.resourceSyncs.map((sync) => ({
          name: "integration/sync.requested" as const,
          data: { integrationId: input.id, resource: sync.resource },
        })),
      );

      return { success: true };
    }),
});
