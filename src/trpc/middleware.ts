import { TRPCError } from "@trpc/server";
import prisma from "@/lib/db";
import { formatResourceName } from "@/lib/string-utils";

// spliting this into it's own function so linting only complains once
const getPrismaModel = (modelName: keyof typeof prisma) => {
  return prisma[modelName] as any;
};

/**
 * Verifies that a resource belongs to the current user
 * Throws NOT_FOUND if resource doesn't exist
 * Throws FORBIDDEN if user doesn't own the resource
 *
 * @param resourceId - The ID of the resource to check
 * @param userId - The ID of the current user
 * @param modelName - The Prisma model name (e.g., 'asset', 'vulnerability')
 * @returns The resource with userId field
 */
export async function requireOwnership(
  resourceId: string,
  userId: string,
  modelName: keyof typeof prisma,
) {
  const resource = await requireExistence({ id: resourceId }, modelName, null, {
    userId: true,
  });

  // TODO: Is this secure? Double check.
  if (resource.userId !== userId) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: `You can only modify ${String(modelName)}s that you created`,
    });
  }

  return resource;
}

/**
 * Error 404 wrapper for findUnique
 * Throws NOT_FOUND if resource doesn't exist
 *
 * @param resourceId - The ID of the resource to check
 * @param modelName - The Prisma model name (e.g., 'asset', 'vulnerability')
 * @param include - (optional) Prisma include clause e.g. { asset: true, deviceGroup: true } or can leave null / empty
 * @param select - (optional) Prisma select clause e.g. { id: true, userId: true } or can leave null / empty
 * @returns The found resource
 */
export async function requireExistence(
  where: unknown,
  modelName: keyof typeof prisma,
  include: unknown = null,
  select: unknown = null,
) {
  const model = getPrismaModel(modelName);
  const resource = await model.findUnique({ where, include, select });

  if (!resource) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: `${formatResourceName(String(modelName))} not found`,
    });
  }

  return resource;
}
