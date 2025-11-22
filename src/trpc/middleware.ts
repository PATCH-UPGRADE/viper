import { TRPCError } from "@trpc/server";
import prisma from "@/lib/db";
import { formatResourceName } from "@/lib/string-utils";

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
  // Type assertion needed because Prisma client types are complex
  const model = prisma[modelName] as any;

  const resource = await model.findUnique({
    where: { id: resourceId },
    select: { userId: true },
  });

  if (!resource) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: `${formatResourceName(String(modelName))} not found`,
    });
  }

  // TODO: Is this secure? Double check.
  if (resource.userId !== userId) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: `You can only modify ${String(modelName)}s that you created`,
    });
  }

  return resource;
}
