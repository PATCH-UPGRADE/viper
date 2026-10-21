import "server-only";
import * as Sentry from "@sentry/nextjs";
import type { PlatformEnum } from "@/generated/prisma";
import prisma from "@/lib/db";
import { registeredModules } from "./registry";

export interface SuggestedPlatform {
  platform: PlatformEnum;
  reason: string;
}

/**
 * Asks every platform with a `suggest` hook, in registry order. A hook that
 * throws is reported and skipped, so one broken platform cannot take the
 * connectors page down.
 */
export const suggestedPlatforms = async (): Promise<SuggestedPlatform[]> => {
  const integrations = await prisma.integration.findMany({
    select: { platform: true, enabled: true },
  });
  const hooks = registeredModules().flatMap(({ definition, suggest }) =>
    suggest ? [{ platform: definition.platform, suggest }] : [],
  );

  const results = await Promise.allSettled(
    hooks.map(async ({ suggest }) => suggest({ integrations })),
  );

  return results.flatMap((result, i) => {
    const { platform } = hooks[i];
    if (result.status === "rejected") {
      Sentry.captureException(result.reason, { tags: { platform } });
      return [];
    }
    return result.value ? [{ platform, reason: result.value.reason }] : [];
  });
};
