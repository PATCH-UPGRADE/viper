import type { Prisma } from "@/generated/prisma";

export type QuestionWithIssue = Prisma.QuestionGetPayload<{
  include: {
    issue: {
      include: { vulnerability: true; deviceGroupMatching: true; asset: true };
    };
  };
}>;
