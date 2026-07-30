import type { Prisma } from "@/generated/prisma";

export type SuggestedVendorEmail = {
  id: string;
  questionId: string;
  audience: "VENDOR" | "MANUFACTURER";
  companyName: string;
  productName: string;
  reasonWhy: string;
  toEmail: string;
  subject: string;
  body: string;
  status: "DRAFT" | "SENT" | "FAILED" | "RESPONDED" | "DISMISSED";
};

export const questionInclude = {
  issue: {
    include: {
      vulnerability: true,
      deviceGroupMatching: {
        include: {
          manufacturer: { select: { canonicalDisplayName: true } },
          product: { select: { canonicalDisplayName: true } },
          version: { select: { canonicalDisplayName: true } },
        },
      },
      asset: true,
    },
  },
} satisfies Prisma.QuestionInclude;

export type QuestionWithIssue = Prisma.QuestionGetPayload<{
  include: {
    issue: {
      include: { vulnerability: true; deviceGroupMatching: true; asset: true };
    };
  };
}>;

export function groupQuestionChains(
  questions: QuestionWithIssue[],
): QuestionWithIssue[][] {
  const byParentId = new Map<string, QuestionWithIssue>();
  for (const ques of questions) {
    if (ques.parentQuestionId) {
      byParentId.set(ques.parentQuestionId, ques);
    }
  }

  const roots = questions.filter((q) => !q.parentQuestionId);
  return roots.map((root) => {
    const chain = [root];
    let current = root;
    while (byParentId.has(current.id)) {
      current = byParentId.get(current.id)!;
      chain.push(current);
    }
    return chain;
  });
}
