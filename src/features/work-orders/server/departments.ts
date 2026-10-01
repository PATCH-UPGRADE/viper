import "server-only";
import prisma from "@/lib/db";

/**
 * Which hospital departments are responsible for any of these assets?
 *
 * A work order is put on the team of every department that a
 * `ManagesRelationship` names for at least one of its assets, whether or not
 * the order is also filed on a vendor platform.
 */
export async function resolveResponsibleDepartments(
  assetIds: string[],
): Promise<string[]> {
  if (assetIds.length === 0) return [];

  const departments = await prisma.department.findMany({
    where: {
      managesRelationships: {
        some: { assets: { some: { id: { in: assetIds } } } },
      },
    },
    select: { id: true },
  });
  return departments.map((d) => d.id);
}
