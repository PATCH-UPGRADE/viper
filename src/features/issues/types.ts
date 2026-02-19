import type { Prisma } from "@/generated/prisma";

export type IssueWithRelations = Prisma.IssueGetPayload<{
  include: { asset: true; vulnerability: true };
}>;
