import { TRPCError } from "@trpc/server";
import prisma from "@/lib/db";
import { formatResourceName } from "@/lib/string-utils";

// Models requireOwnership can check: every one has a `userId` field, which is
// what the `as typeof prisma.asset` cast below assumes. Adding a model here
// that lacks `userId` fails at compile time on its call site, not silently at
// runtime (see PR #227 review: passing a model without `userId` produces a
// Prisma "Unknown field 'userId'" warning and a broken ownership check).
type OwnableModel =
  | "artifact"
  | "artifactWrapper"
  | "deviceArtifact"
  | "remediation"
  | "webhook"
  | "asset"
  | "vulnerability";

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
  modelName: OwnableModel,
) {
  const model = prisma[modelName] as unknown as typeof prisma.asset;

  const resource = requireExistence(
    await model.findUnique({
      where: { id: resourceId },
      select: { userId: true },
    }),
    String(modelName),
  );

  // TODO: Is this secure? Double check.
  if (resource.userId !== userId) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: `You can only modify ${String(modelName)}s that you created`,
    });
  }

  return resource;
}

export function requireExistence<T>(item: T | null, modelName: string): T {
  if (item === null) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: `${formatResourceName(modelName)} not found`,
    });
  }
  return item;
}
