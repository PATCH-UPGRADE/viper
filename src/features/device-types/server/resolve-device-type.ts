import "server-only";
import type { DeviceType } from "@/generated/prisma";
import prisma from "@/lib/db";
import { normalizeName } from "@/lib/router-utils";

/**
 * Map a device type string from an integration to a DeviceType: the
 * displayName (case-insensitive) first, then nameMappings. Returns null and
 * warns if nothing matches. `context` goes into the warning, so that the
 * unmatched record can be found and seeded.
 */
export async function resolveDeviceType(
  name: string | null | undefined,
  context: Record<string, unknown> = {},
): Promise<DeviceType | null> {
  const normalized = normalizeName(name ?? "");
  if (!normalized) {
    console.warn("No device type string to map", context);
    return null;
  }

  const deviceType =
    (await prisma.deviceType.findFirst({
      where: { displayName: { equals: normalized, mode: "insensitive" } },
    })) ??
    (await prisma.deviceType.findFirst({
      where: { nameMappings: { has: normalized } },
    }));

  if (!deviceType) {
    console.warn("No device type matches", { name, ...context });
  }
  return deviceType;
}
