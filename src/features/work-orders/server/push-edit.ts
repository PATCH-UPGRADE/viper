import "server-only";
import { TRPCError } from "@trpc/server";
import { decryptCredentials } from "@/features/integrations/core/credentials";
import { registry } from "@/features/integrations/core/registry";
import { openSession } from "@/features/integrations/core/session";
import type {
  EditableWorkOrderField,
  WorkOrderPatch,
} from "@/features/integrations/core/types";
import type {
  PlatformEnum,
  Priority,
  TicketCategory,
  TicketStatus,
} from "@/generated/prisma";
import prisma from "@/lib/db";
import { lockedFieldMessage } from "../locked-fields";

// Edits to a work order that a platform also holds.
//
// Nothing here knows a platform. The ticket's mappings name the integrations,
// and each work order module says what it accepts (`update`, `pushedFields`)
// and what it owns (`lockedFields`).

export interface LockedField {
  field: EditableWorkOrderField;
  /** The integration that owns the field, for the message the user sees. */
  managedBy: string;
}

/** The fields that a ticket's platforms own, so a VIPER user cannot edit them. */
export const lockedFieldsFor = (
  mappings: { integration: { name: string; platform: PlatformEnum } }[],
): LockedField[] =>
  mappings.flatMap(({ integration }) =>
    (registry[integration.platform]?.workOrders?.lockedFields ?? []).map(
      (field) => ({ field, managedBy: integration.name }),
    ),
  );

interface TicketFields {
  summary: string;
  body: string | null;
  status: TicketStatus;
  category: TicketCategory;
  priority: Priority;
  scheduledAt: Date | null;
  scheduledEndTime: Date | null;
}

const sameTime = (a: Date | null, b: Date | null) =>
  (a?.getTime() ?? null) === (b?.getTime() ?? null);

/**
 * The editable fields that this edit changes. The edit form sends every field
 * on each save, so an unchanged field must not reach a platform.
 */
export function patchFor(
  current: TicketFields,
  edit: Partial<TicketFields>,
): WorkOrderPatch {
  const patch: WorkOrderPatch = {};
  if (edit.summary !== undefined && edit.summary !== current.summary) {
    patch.summary = edit.summary;
  }
  if (edit.body !== undefined && (edit.body ?? "") !== (current.body ?? "")) {
    patch.description = edit.body ?? "";
  }
  if (edit.status !== undefined && edit.status !== current.status) {
    patch.status = edit.status;
  }
  if (edit.category !== undefined && edit.category !== current.category) {
    patch.category = edit.category;
  }
  if (edit.priority !== undefined && edit.priority !== current.priority) {
    patch.priority = edit.priority;
  }
  if (
    edit.scheduledAt !== undefined &&
    !sameTime(edit.scheduledAt, current.scheduledAt)
  ) {
    patch.scheduledAt = edit.scheduledAt?.toISOString() ?? null;
  }
  if (
    edit.scheduledEndTime !== undefined &&
    !sameTime(edit.scheduledEndTime, current.scheduledEndTime)
  ) {
    patch.scheduledEndTime = edit.scheduledEndTime?.toISOString() ?? null;
  }
  return patch;
}

const pick = (
  patch: WorkOrderPatch,
  fields: readonly EditableWorkOrderField[],
): WorkOrderPatch =>
  Object.fromEntries(
    Object.entries(patch).filter(([field]) =>
      fields.includes(field as EditableWorkOrderField),
    ),
  );

/**
 * Refuse an edit to a field a platform owns, then send the rest of the edit to
 * each platform that holds the ticket.
 *
 * Call it before the edit is saved. If a platform refuses, nothing is saved, so
 * VIPER never shows a value the platform does not have. If the save fails after
 * the push, the next pull brings the platform's value back. The call is outside
 * the database transaction, so the HTTP request never holds the row lock.
 *
 * A disabled integration keeps its locks but gets no push: it is not syncing,
 * and the next pull after it is enabled again brings its values back.
 */
export async function pushEditToPlatforms(
  ticketId: string,
  current: TicketFields,
  edit: Partial<TicketFields>,
): Promise<void> {
  const patch = patchFor(current, edit);
  if (Object.keys(patch).length === 0) return;

  const mappings = await prisma.externalWorkOrderMapping.findMany({
    where: { itemId: ticketId },
    select: {
      externalId: true,
      integration: {
        select: {
          id: true,
          name: true,
          platform: true,
          enabled: true,
          config: true,
          credentials: true,
        },
      },
    },
  });
  if (mappings.length === 0) return;

  const lock = lockedFieldsFor(mappings).find((l) => l.field in patch);
  if (lock) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: lockedFieldMessage(lock.field, lock.managedBy),
    });
  }

  for (const { externalId, integration } of mappings) {
    const connector = registry[integration.platform];
    const module = connector?.workOrders;
    if (!connector || !module?.update || !integration.enabled) continue;
    const pushed = pick(patch, module.pushedFields ?? []);
    if (Object.keys(pushed).length === 0) continue;

    try {
      const config = connector.definition.configSchema.parse(
        integration.config,
      );
      if (!integration.credentials) {
        throw new Error("the integration has no stored credentials");
      }
      const creds = connector.definition.credentialSchema.parse(
        decryptCredentials(integration.credentials),
      );
      const session = openSession(connector, {
        integrationId: integration.id,
        config,
        creds,
      });
      await module.update(session, externalId, pushed, config);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new TRPCError({
        code: "BAD_GATEWAY",
        message: `${integration.name} did not accept the change, so VIPER saved nothing: ${reason}`,
        cause: error,
      });
    }
  }
}
