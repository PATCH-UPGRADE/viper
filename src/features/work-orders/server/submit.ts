import "server-only";
import { decryptCredentials } from "@/features/integrations/core/credentials";
import { requirePlatform } from "@/features/integrations/core/registry";
import { moduleForResource } from "@/features/integrations/core/sync/resources";
import type {
  WorkOrderDraftInput,
  WorkOrderModule,
} from "@/features/integrations/core/types";
import { attachExternalMapping } from "@/features/tracking/server/asset-tickets";
import { ResourceType, SubmissionState } from "@/generated/prisma";
import prisma from "@/lib/db";

/**
 * Filing a draft work order on whichever platform manages its assets.
 *
 * Nothing here knows a platform. The integration row names one, the registry
 * hands back its module, and the module owns the payload shape, the draft, and
 * the call. Adding a platform must not require an edit to this file.
 */

/**
 * Open one authenticated session for an integration. Signing in can be
 * expensive — Fleet drives a headless browser — so a submission that covers
 * several assets opens this once and files every asset through it.
 */
async function openFiler(integrationId: string) {
  const integration = await prisma.integration.findUniqueOrThrow({
    where: { id: integrationId },
    select: { platform: true, config: true, credentials: true, name: true },
  });

  const connector = requirePlatform(integration.platform);
  const module = moduleForResource(connector, ResourceType.WorkOrder) as
    | WorkOrderModule
    | undefined;

  if (!module?.create) {
    throw new Error(
      `${integration.name} cannot have work orders filed on it — its platform has no work order module.`,
    );
  }
  if (!connector.createSession) {
    throw new Error(
      `${integration.name} cannot be signed in to — its platform provides no session.`,
    );
  }

  const config = connector.definition.configSchema.parse(integration.config);
  const creds = integration.credentials
    ? connector.definition.credentialSchema.parse(
        decryptCredentials(integration.credentials),
      )
    : null;

  if (!creds) {
    throw new Error(
      `${integration.name} has no stored credentials — cannot sign in to file a work order.`,
    );
  }

  return {
    session: await connector.createSession({ config, creds }),
    config,
    module,
  };
}

/**
 * Claim a ticket for submission.
 *
 * The compare-and-swap is the whole point: two approvals racing each other both
 * read PENDING, but only one write moves it to SUBMITTING, and the loser files
 * nothing. A boolean flag could not express this.
 */
export async function claimForSubmission(ticketId: string): Promise<boolean> {
  const { count } = await prisma.workOrderTicket.updateMany({
    where: {
      id: ticketId,
      submissionState: {
        in: [SubmissionState.PENDING, SubmissionState.FAILED],
      },
    },
    data: {
      submissionState: SubmissionState.SUBMITTING,
      submissionError: null,
    },
  });
  return count === 1;
}

export async function releaseClaim(
  ticketId: string,
  error: unknown,
): Promise<void> {
  await prisma.workOrderTicket.update({
    where: { id: ticketId },
    data: {
      submissionState: SubmissionState.FAILED,
      submissionError:
        error instanceof Error
          ? error.message
          : String(error ?? "Unknown error"),
    },
  });
}

interface SubmissionFailure {
  asset: string;
  message: string;
}

/**
 * File one already-claimed ticket. Returns what was filed and what failed.
 *
 * Failures are collected per asset rather than aborting: an order the platform
 * did accept must still be recorded here, or the next attempt files it twice.
 */
export async function fileClaimedTicket(
  ticketId: string,
  actorId: string,
): Promise<{ externalIds: string[]; failures: SubmissionFailure[] }> {
  const ticket = await prisma.workOrderTicket.findUniqueOrThrow({
    where: { id: ticketId },
    select: {
      id: true,
      summary: true,
      body: true,
      category: true,
      scheduledAt: true,
      platformPayload: true,
      targetIntegrationId: true,
      assets: {
        select: {
          asset: {
            select: { id: true, hostname: true, ip: true },
          },
          ticketId: true,
        },
      },
    },
  });

  if (!ticket.targetIntegrationId) {
    throw new Error("This work order names no platform to file it on.");
  }
  // Narrowed once, so the per-asset writes below need no cast.
  const integrationId = ticket.targetIntegrationId;

  const actor = await prisma.user.findUniqueOrThrow({
    where: { id: actorId },
    select: { name: true, email: true },
  });

  const { session, config, module } = await openFiler(integrationId);
  const payload = module.payloadSchema.parse(ticket.platformPayload ?? {});
  // Re-checked at the point of sending. The proposal was validated when it was
  // drafted, but a stored payload can outlive the rules that accepted it.
  module.assertSubmittable?.(payload);

  const mappings = await prisma.externalAssetMapping.findMany({
    where: {
      integrationId,
      itemId: { in: ticket.assets.map((a) => a.asset.id) },
    },
    select: { itemId: true, externalId: true },
  });

  // A FAILED ticket can be claimed again, and a child that already carries a
  // mapping for this integration was filed on a previous attempt. Sending it
  // again would open a second order on the vendor for the same asset.
  const alreadyFiled = new Map(
    (
      await prisma.externalWorkOrderMapping.findMany({
        where: {
          integrationId,
          itemId: { in: ticket.assets.map((a) => a.ticketId) },
        },
        select: { itemId: true, externalId: true },
      })
    ).map((m) => [m.itemId, m.externalId]),
  );

  const externalIds: string[] = [];
  const failures: SubmissionFailure[] = [];

  for (const { asset, ticketId: childTicketId } of ticket.assets) {
    const label = asset.hostname ?? asset.ip ?? asset.id;
    const filed = alreadyFiled.get(childTicketId);
    if (filed) {
      externalIds.push(filed);
      continue;
    }
    try {
      const input: WorkOrderDraftInput = {
        summary: ticket.summary,
        description: ticket.body ?? "",
        category: ticket.category,
        scheduledAt: ticket.scheduledAt?.toISOString() ?? null,
        asset: {
          id: asset.id,
          hostname: asset.hostname,
          ip: asset.ip,
          externalId:
            mappings.find((m) => m.itemId === asset.id)?.externalId ?? null,
        },
        actor: { name: actor.name, email: actor.email ?? "" },
        payload,
        reference: ticket.id,
      };

      const result = await module.create?.(
        session,
        module.toDraft(input, config),
        config,
      );
      if (!result) throw new Error("The platform filed nothing.");

      // One write per asset, deliberately: an order the vendor accepted is
      // recorded before the next call, so a crash mid-loop cannot re-file it.
      // The upsert is atomic on its own, so it needs no transaction.
      await attachExternalMapping(prisma, childTicketId, {
        integrationId,
        externalId: result.externalId,
        lastSynced: new Date(),
      });
      externalIds.push(result.externalId);
    } catch (error) {
      failures.push({
        asset: label,
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  return { externalIds, failures };
}

/** Roll the parent up from what its per-asset children managed. */
export async function finishSubmission(
  ticketId: string,
  filed: number,
  failures: SubmissionFailure[],
): Promise<void> {
  await prisma.workOrderTicket.update({
    where: { id: ticketId },
    data:
      filed > 0
        ? {
            submissionState: SubmissionState.SUBMITTED,
            submittedAt: new Date(),
            submissionError: failures.length
              ? `Filed ${filed}, failed ${failures.length}: ${failures.map((f) => `${f.asset} — ${f.message}`).join("; ")}`
              : null,
          }
        : {
            submissionState: SubmissionState.FAILED,
            submissionError: failures
              .map((f) => `${f.asset} — ${f.message}`)
              .join("; "),
          },
  });
}
