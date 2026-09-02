import "server-only";
import { requirePlatform } from "@/features/integrations/core/registry";
import type { WorkOrderModule } from "@/features/integrations/core/types";
import type { PlatformEnum } from "@/generated/prisma";
import prisma from "@/lib/db";
import {
  labelFor,
  type ResolvedTargets,
  type WorkOrderTarget,
} from "./targets";

/**
 * The work order module for a platform, or null when that platform cannot be
 * filed on.
 *
 * Filing needs two things a platform declares separately: the module itself,
 * and a way to authenticate. Both are checked here, so a platform that can only
 * do half the job is never offered to a model — the alternative is a draft the
 * user approves and a job that then discovers there is no session.
 *
 * Pure: the registry is an in-memory table, so knowing the platform is enough.
 */
function workOrderModuleForPlatform(
  platform: PlatformEnum,
): WorkOrderModule | null {
  const connector = requirePlatform(platform);
  if (!connector.createSession) return null;
  return connector.workOrders ?? null;
}

/** The same, for a caller that holds only an integration id. */
async function workOrderModuleFor(
  integrationId: string,
): Promise<{ module: WorkOrderModule; name: string } | null> {
  const integration = await prisma.integration.findUnique({
    where: { id: integrationId },
    select: { platform: true, name: true },
  });
  if (!integration) return null;

  const module = workOrderModuleForPlatform(integration.platform);
  return module ? { module, name: integration.name } : null;
}

/** A target paired with the module that files for it. */
export interface FileableTarget extends WorkOrderTarget {
  module: WorkOrderModule;
}

/**
 * Keep only the targets a work order can actually be filed on, each with its
 * module.
 *
 * A `ManagesRelationship` can name any integration as its work order target,
 * including one whose platform has no create call. Such a target must not reach
 * the model: naming it is refused by the payload check, and leaving it out is
 * refused as an untargeted order, so the asset could never be proposed for at
 * all. Its assets are accounted unmanaged instead, and VIPER tracks the order.
 */
export function keepFileableTargets(resolved: ResolvedTargets): {
  targets: FileableTarget[];
  unmanaged: ResolvedTargets["unmanaged"];
  unknownIds: string[];
} {
  const targets: FileableTarget[] = [];
  const dropped: ResolvedTargets["targets"] = [];

  for (const target of resolved.targets) {
    const module = workOrderModuleForPlatform(target.platform);
    if (module) targets.push({ ...target, module });
    else dropped.push(target);
  }

  // An asset can be managed twice over — a vendor contract and a department
  // arrangement, say — so one of its platforms being unfileable does not make
  // the asset unmanaged. Only report the assets no retained target covers, or
  // the model is told the same asset is both fileable and not.
  const covered = new Set(targets.flatMap((t) => t.assets.map((a) => a.id)));
  const unmanaged = [...resolved.unmanaged];
  const seen = new Set(unmanaged.map((u) => u.id));

  for (const target of dropped) {
    for (const asset of target.assets) {
      if (covered.has(asset.id) || seen.has(asset.id)) continue;
      seen.add(asset.id);
      unmanaged.push({ id: asset.id, label: labelFor(asset) });
    }
  }

  return { targets, unmanaged, unknownIds: resolved.unknownIds };
}

interface PayloadRejection {
  ok: false;
  reason: string;
}

type PayloadCheck =
  | { ok: true; payload: Record<string, unknown> }
  | PayloadRejection;

/**
 * Validate what a model filled in against the platform it chose.
 *
 * The failure text is written to be read by the model, which is why it names
 * the fields.
 */
export function validatePayloadForModule(
  module: WorkOrderModule,
  name: string,
  payload: unknown,
): PayloadCheck {
  const parsed = module.payloadSchema.safeParse(payload ?? {});
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("; ");
    return { ok: false, reason: `Those fields do not fit ${name}: ${issues}` };
  }

  try {
    module.assertSubmittable?.(parsed.data);
  } catch (error) {
    return {
      ok: false,
      reason:
        error instanceof Error ? error.message : "Refused by the platform.",
    };
  }

  return { ok: true, payload: parsed.data };
}

/**
 * The same, for a caller that holds only an integration id. Both entry points
 * run the same checks, so a payload cannot be accepted by one and refused by
 * the other.
 */
export async function validatePlatformPayload(
  integrationId: string,
  payload: unknown,
): Promise<PayloadCheck> {
  const found = await workOrderModuleFor(integrationId);
  if (!found) {
    return {
      ok: false,
      reason: `Integration ${integrationId} cannot have work orders filed on it.`,
    };
  }
  return validatePayloadForModule(found.module, found.name, payload);
}
