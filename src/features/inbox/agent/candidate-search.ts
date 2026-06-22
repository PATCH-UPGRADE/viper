import "server-only";
import type { Prisma } from "@/generated/prisma";
import prisma from "@/lib/db";
import type { ExtractedDeviceGroup, ExtractResult } from "./extract";

const TOP_K = 5;

export type DeviceGroupCandidate = {
  id: string;
  cpe: string;
  manufacturer: string | null;
  modelName: string | null;
  version: string | null;
};

export type Candidates = {
  // Parallel to ExtractResult: one candidate list per extracted entity, in order.
  deviceGroups: Array<{
    extracted: ExtractedDeviceGroup;
    matches: DeviceGroupCandidate[];
  }>;
};

// Returns top-K candidates per extracted entity.
async function searchDeviceGroup(
  extracted: ExtractedDeviceGroup,
): Promise<DeviceGroupCandidate[]> {
  const terms = [
    extracted.cpe,
    extracted.manufacturer,
    extracted.modelName,
  ].filter((t): t is string => !!t && t.trim().length > 0);

  if (terms.length === 0) return [];

  const or: Prisma.DeviceGroupWhereInput[] = [];
  // TODO: consider something like a fuzzy search?
  // or an embedding. For example, if the identified manufacturer is Draeger Inc, and the db manufactuerer is "Draeger", this contains fails
  for (const term of terms) {
    or.push(
      { cpe: { contains: term, mode: "insensitive" } },
      { manufacturer: { contains: term, mode: "insensitive" } },
      { modelName: { contains: term, mode: "insensitive" } },
    );
  }

  return prisma.deviceGroup.findMany({
    where: { OR: or },
    select: {
      id: true,
      cpe: true,
      manufacturer: true,
      modelName: true,
      version: true,
    },
    take: TOP_K,
  });
}

export async function searchCandidates(
  extracted: ExtractResult,
): Promise<Candidates> {
  const deviceGroups = await Promise.all(
    extracted.deviceGroups.map(async (dg) => ({
      extracted: dg,
      matches: await searchDeviceGroup(dg),
    })),
  );

  return { deviceGroups };
}
