import "server-only";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { createAssetTicket } from "@/features/tracking/server/asset-tickets";
import {
  proposeWorkOrderSchema,
  type WorkOrderProposal,
} from "@/features/work-orders/schemas";
import {
  type FileableTarget,
  keepFileableTargets,
  validatePayloadForModule,
} from "@/features/work-orders/server/payload";
import {
  labelFor,
  resolveWorkOrderTargets,
} from "@/features/work-orders/server/targets";
import { SubmissionState, TicketStatus } from "@/generated/prisma";
import prisma from "@/lib/db";
import { TOOL_REJECTED_PREFIX } from "../shared/build-graph";

/**
 * Two tools rather than one, because the fields a platform wants are not known
 * until the platform is chosen, and a tool's declared schema is fixed when the
 * model is bound. So the first call answers "who files for these assets, and
 * what do they need", and the second sends it.
 *
 * Not a subagent: `shouldHalt` reads the top-level graph state, and the approval
 * card is rendered from a top-level tool part, so a nested agent could neither
 * halt the turn nor produce a card.
 */

/** ISO-8601 ending in Z or an explicit +hh:mm / -hh:mm offset. */
const HAS_EXPLICIT_ZONE = /([Zz]|[+-]\d{2}:?\d{2})$/;

const makeListTargets = () =>
  tool(
    async ({ assetIds }) => {
      const { targets, unmanaged, unknownIds } = keepFileableTargets(
        await resolveWorkOrderTargets(assetIds),
      );
      // Reported apart from `unmanaged`: an id with no asset behind it is a
      // mistake to correct, not a device to file for.
      const known = new Set(unknownIds);

      const described = targets.map((t) => ({
        integrationId: t.integrationId,
        integrationName: t.integrationName,
        managedBy: t.managedBy,
        responsibilities: t.responsibilities,
        assets: t.assets.map((a) => ({
          id: a.id,
          label: labelFor(a),
          knownToThePlatform: a.externalId !== null,
        })),
        // The exact shape propose_work_order expects for this platform.
        platformFields: z.toJSONSchema(t.module.payloadSchema),
      }));

      return JSON.stringify(
        {
          targets: described,
          unmanaged: unmanaged.filter((u) => !known.has(u.id)),
          unknownIds,
          guidance: unmanaged.length
            ? "Assets under `unmanaged` have no platform that files for them. A work order for those is still worth proposing — it is tracked in VIPER and nothing is sent to a vendor."
            : undefined,
        },
        null,
        2,
      );
    },
    {
      name: "list_work_order_targets",
      description:
        "Find which external platforms file work orders for the given assets, and what each one needs. Returns one entry per platform with the assets it covers, who manages them, and a JSON Schema for that platform's own fields. Call this before propose_work_order, and copy the schema exactly. Assets no platform manages come back under `unmanaged`; a work order for those is tracked in VIPER alone.",
      schema: z.object({
        assetIds: z
          .array(z.string())
          .min(1)
          .describe("Full VIPER asset ids the work order would cover."),
      }),
    },
  );

/**
 * Creates the draft and stops the turn. Nothing reaches the vendor until the
 * user approves it, which is when the submitter runs.
 */
const makeProposeWorkOrder = (userId: string) =>
  tool(
    async (input) => {
      const requested = [...new Set(input.assetIds)];
      const { targets, unmanaged, unknownIds } = keepFileableTargets(
        await resolveWorkOrderTargets(requested),
      );

      // Checked before anything reasons about coverage: an id with no asset
      // behind it is not "outside the target", it does not exist, and saying so
      // is what lets the model correct itself. Left later, it would also reach
      // the child-ticket create as a foreign key that does not resolve and throw
      // out of the tool without the rejection prefix.
      if (unknownIds.length > 0) {
        return `${TOOL_REJECTED_PREFIX} No asset exists with id ${unknownIds.join(", ")}. Use the full ids from list_work_order_targets or query_platform_data.`;
      }

      let payload: Record<string, unknown> = {};
      let target: FileableTarget | null = null;

      if (input.targetIntegrationId) {
        target =
          targets.find((t) => t.integrationId === input.targetIntegrationId) ??
          null;
        if (!target) {
          return `${TOOL_REJECTED_PREFIX} No platform files for those assets through integration ${input.targetIntegrationId}. Call list_work_order_targets and choose one it returns.`;
        }

        // One order goes to one platform, so an asset the chosen target does not
        // cover would be dropped from the draft without the user ever seeing it.
        // Refuse instead, and let the model split the proposal per target.
        const inTarget = new Set(target.assets.map((a) => a.id));
        const outside = requested.filter((id) => !inTarget.has(id));
        if (outside.length > 0) {
          return `${TOOL_REJECTED_PREFIX} ${target.integrationName} does not cover ${outside.join(", ")}. One work order goes to one platform, so propose a separate order for those assets.`;
        }

        const checked = validatePayloadForModule(
          target.module,
          target.integrationName,
          input.platformPayload,
        );
        if (!checked.ok) {
          return `${TOOL_REJECTED_PREFIX} ${checked.reason}`;
        }
        payload = checked.payload;
      } else if (targets.length > 0) {
        return `${TOOL_REJECTED_PREFIX} A platform does file for those assets (${targets
          .map((t) => t.integrationName)
          .join(
            ", ",
          )}), so name it as targetIntegrationId rather than leaving the order untargeted.`;
      }

      const covered = requested;

      // The model writes this as free text, so an unparsable value would reach
      // Prisma as an Invalid Date and throw out of the tool. A throw does not
      // carry the rejection prefix, so the graph would halt the turn with no
      // card and no explanation. Refuse it correctably instead.
      let scheduledAt: Date | null = null;
      if (input.scheduledAt) {
        // A zone-less datetime is read as the server's local time, which is not
        // the window anyone agreed to: it is stored shifted, and the vendor is
        // told a different hour than the approver saw on the card.
        if (!HAS_EXPLICIT_ZONE.test(input.scheduledAt)) {
          return `${TOOL_REJECTED_PREFIX} "${input.scheduledAt}" has no timezone, so the hour is ambiguous. Give scheduledAt with an offset or Z, for example 2026-09-15T14:00:00-05:00, or omit it.`;
        }
        scheduledAt = new Date(input.scheduledAt);
        if (Number.isNaN(scheduledAt.getTime())) {
          return `${TOOL_REJECTED_PREFIX} "${input.scheduledAt}" is not a datetime. Give scheduledAt as ISO-8601, for example 2026-09-15T14:00:00-05:00, or omit it.`;
        }
      }

      const labels = new Map(
        target
          ? target.assets.map((a) => [a.id, labelFor(a)])
          : unmanaged.map((u) => [u.id, u.label]),
      );
      // The hostname/IP each child ticket names, already fetched by the target
      // resolution. Absent only on the untargeted branch, where the child falls
      // back to reading the asset itself.
      const assetRows = new Map(
        (target?.assets ?? []).map((a) => [
          a.id,
          { hostname: a.hostname, ip: a.ip },
        ]),
      );

      // The per-asset children are made here rather than at approval, because
      // the submitter files one order per child and records the platform's id
      // on it. Each child inherits the parent's draft state, so a proposal that
      // is never approved stays off the board and off the asset's work orders.
      const draft = await prisma.$transaction(async (tx) => {
        const parent = await tx.workOrderTicket.create({
          data: {
            summary: input.summary,
            body: input.description,
            category: input.category,
            status: TicketStatus.TO_DO,
            scheduledAt,
            // Hidden from the tracking board until it is approved.
            isDraft: true,
            creatorId: userId,
            targetIntegrationId: target?.integrationId ?? null,
            platformPayload: target ? payload : undefined,
            submissionState: target
              ? SubmissionState.PENDING
              : SubmissionState.NONE,
          },
          select: {
            id: true,
            summary: true,
            body: true,
            category: true,
            priority: true,
            creatorId: true,
            scheduledAt: true,
            sourceLabel: true,
            isDraft: true,
          },
        });

        // The parent was just written and the assets came back with the
        // targets, so both are passed down. Otherwise each child re-reads the
        // same parent row and its own asset row, inside this transaction.
        for (const assetId of covered) {
          await createAssetTicket(tx, {
            parentTicketId: parent.id,
            assetId,
            actorId: userId,
            parent,
            asset: assetRows.get(assetId),
          });
        }
        return parent;
      });

      const proposal: WorkOrderProposal = {
        type: "work_order_proposal",
        ticketId: draft.id,
        summary: input.summary,
        description: input.description,
        category: input.category,
        scheduledAt: input.scheduledAt ?? null,
        rationale: input.rationale ?? null,
        target: target
          ? {
              integrationId: target.integrationId,
              integrationName: target.integrationName,
              managedBy: target.managedBy,
            }
          : null,
        assets: covered.map((id) => ({ id, label: labels.get(id) ?? id })),
        platformPayload: payload,
      };
      return JSON.stringify(proposal);
    },
    {
      name: "propose_work_order",
      description: `Propose a work order for one or more assets, for the user to approve.
This does NOT file anything. It drafts the order and presents it; only when the user accepts is it tracked in VIPER and, when a platform manages the assets, filed with that vendor. Never tell the user the work order has been created or scheduled — say you have proposed one for their approval.
Call list_work_order_targets first, to learn which platform files for the assets and what fields it needs.`,
      schema: proposeWorkOrderSchema,
    },
  );

export const makeWorkOrderTools = (userId: string) => [
  makeListTargets(),
  makeProposeWorkOrder(userId),
];
