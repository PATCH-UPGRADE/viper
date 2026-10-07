import "server-only";
import { TRPCError } from "@trpc/server";
import { AuthType } from "@/generated/prisma";
import prisma from "@/lib/db";
import type { AuthCredential } from "../core/credentials";
import { encryptCredentials, usesGenericAuth } from "../core/credentials";
import { requirePlatform } from "../core/registry";
import { resourcesFor } from "../core/sync/resources";
import type { AnyConnectorModule } from "../core/types";
import type { IntegrationFormValues } from "../types";

/** Encrypted credentials must never reach the browser. */
export const omitCredentials = { credentials: true } as const;

export const integrationsInclude = {
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

export const toRowShape = (input: IntegrationFormValues) => {
  const module = requirePlatform(input.platform);
  const { definition } = module;

  const config = definition.configSchema.parse(input.config);

  return {
    row: {
      name: input.name,
      platform: input.platform,
      ...(input.syncEvery !== undefined && { syncEvery: input.syncEvery }),
      config,
    },
    module,
    config,
  };
};

/** AuthType.None means "nothing to protect" only for generic-auth platforms. */
export const toCredentialBlob = (
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

export const asBadRequest = <T>(fn: () => T): T => {
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

export async function createIntegration(
  input: IntegrationFormValues,
  userId: string,
) {
  const { name } = input;
  const { row, module, config } = asBadRequest(() => toRowShape(input));
  const credentials = asBadRequest(() =>
    toCredentialBlob(module, input.credentials),
  );
  const resources = asBadRequest(() => resourcesFor(module, config));

  const integration = await prisma.$transaction(async (tx) => {
    if (module.definition.singleton) {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`integration:${row.platform}`}))`;
      const existing = await tx.integration.findFirst({
        where: { platform: row.platform },
        select: { id: true },
      });
      if (existing) {
        throw new TRPCError({
          code: "CONFLICT",
          message: `A ${module.definition.displayName} integration already exists.`,
        });
      }
    }

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
        userId,
        integrationUserId: integrationUser.id,
        resourceSyncs: {
          create: resources.map((resource) => ({ resource })),
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
}
