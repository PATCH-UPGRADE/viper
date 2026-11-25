import "server-only";
import { SourceChannel } from "@/generated/prisma";
import { getAutomationUser } from "@/lib/automation-user";
import prisma from "@/lib/db";
import type { ObservationOrigin } from "./types";

/** The origin of a tRPC write, from `ctx.auth`. Only an API key sets `key`. */
export function requestOrigin(auth: {
  user: { id: string };
  key?: unknown;
}): ObservationOrigin {
  return {
    source: auth.key ? "API_CLIENT" : "MANUAL",
    actorUserId: auth.user.id,
  };
}

/**
 * The origin of values that an LLM extracted from a source record: whoever sent
 * the record. Call it before a transaction, because it uses its own connection.
 */
export async function sourceRecordOrigin(
  sourceRecordId: string,
): Promise<ObservationOrigin> {
  const { channel, observedAt, mapping } =
    await prisma.sourceRecord.findUniqueOrThrow({
      where: { id: sourceRecordId },
      select: {
        channel: true,
        observedAt: true,
        mapping: {
          select: { integration: { select: { id: true, name: true } } },
        },
      },
    });
  const { id: actorUserId } = await getAutomationUser();

  switch (channel) {
    case SourceChannel.Email:
      return { source: "EMAIL", actorUserId };
    case SourceChannel.TA4:
      return { source: "API_CLIENT", actorUserId };
    case SourceChannel.Integration:
      if (!mapping) {
        throw new Error(`Source record ${sourceRecordId} has no integration`);
      }
      return {
        source: "INTEGRATION",
        integrationId: mapping.integration.id,
        integrationName: mapping.integration.name,
        observedAt,
        actorUserId,
      };
  }
}
