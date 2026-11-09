import "server-only";
import { TRPCError } from "@trpc/server";
import { loadIntegrationContext } from "@/features/integrations/core/context";
import { registry } from "@/features/integrations/core/registry";
import { openSession } from "@/features/integrations/core/session";
import type {
  EditableWorkOrderField,
  WorkOrderPatch,
} from "@/features/integrations/core/types";
import type { PlatformEnum, Prisma } from "@/generated/prisma";
import prisma from "@/lib/db";
import { type LockedField, lockedFieldMessage } from "../locked-fields";

// Edits to a work order that a platform also holds.
//
// Nothing here knows a platform. The ticket's mapping names the integration,
// and its work order module says what it accepts (`update`, `pushedFields`)
// and what it owns (`lockedFields`).

/** The fields that a ticket's platform owns, so a VIPER user cannot edit them. */
export const lockedFieldsFor = (
  mapping: { integration: { name: string; platform: PlatformEnum } } | null,
): LockedField[] =>
  mapping
    ? (
        registry[mapping.integration.platform]?.workOrders?.lockedFields ?? []
      ).map((field) => ({ field, managedBy: mapping.integration.name }))
    : [];

/** The ticket columns that `patchFor` compares. */
export const editableTicketSelect = {
  summary: true,
  body: true,
  status: true,
  category: true,
  priority: true,
  scheduledAt: true,
  scheduledEndTime: true,
} as const satisfies Prisma.WorkOrderTicketSelect;

type TicketFields = Prisma.WorkOrderTicketGetPayload<{
  select: typeof editableTicketSelect;
}>;

const sameTime = (a: Date | null, b: Date | null) =>
  (a?.getTime() ?? null) === (b?.getTime() ?? null);

/**
 * The editable fields that this edit changes. A caller can send a field with
 * its current value, and an unchanged field must not reach a platform.
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
 * Refuse an edit to a field the ticket's platform owns, then send the rest of
 * the edit to that platform.
 *
 * Call it before the edit is saved. If the platform refuses, nothing is saved,
 * so VIPER never shows a value the platform does not have. If the save fails
 * after the push, the next pull brings the platform's value back. The call is
 * outside the database transaction, so the HTTP request never holds the row
 * lock.
 *
 * A disabled integration keeps its locks, and VIPER refuses an edit to a field
 * that it pushes. A pull reads only records that changed on the platform, so a
 * value saved in VIPER only stays different from the platform.
 */
export async function pushEditToPlatforms(
  ticketId: string,
  current: TicketFields,
  edit: Partial<TicketFields>,
): Promise<void> {
  const patch = patchFor(current, edit);
  if (Object.keys(patch).length === 0) return;

  const mapping = await prisma.externalWorkOrderMapping.findUnique({
    where: { itemId: ticketId },
    select: {
      externalId: true,
      integration: {
        select: { id: true, name: true, platform: true, enabled: true },
      },
    },
  });
  if (!mapping) return;

  const lock = lockedFieldsFor(mapping).find((l) => l.field in patch);
  if (lock) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: lockedFieldMessage(lock.field, lock.managedBy),
    });
  }

  const { externalId, integration } = mapping;
  const module = registry[integration.platform]?.workOrders;
  if (!module?.update) return;
  const pushed = pick(patch, module.pushedFields ?? []);
  if (Object.keys(pushed).length === 0) return;

  if (!integration.enabled) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `${integration.name} is disabled, so VIPER cannot send this change. Enable the integration, or make the change in ${integration.name}.`,
    });
  }

  try {
    const {
      module: connector,
      config,
      creds,
    } = await loadIntegrationContext(integration.id);
    const session = openSession(connector, {
      integrationId: integration.id,
      config,
      creds,
    });
    await module.update(session, externalId, pushed, config);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: `${integration.name} did not accept the change, so VIPER saved nothing: ${reason}`,
      cause: error,
    });
  }
}
