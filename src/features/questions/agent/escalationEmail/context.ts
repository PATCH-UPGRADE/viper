import "server-only";
import type { QuestionWithIssue } from "@/features/questions/types";

export function buildEscalationContext(question: QuestionWithIssue): string {
  const vendorName = "The vendor"; // get it later;
  const productName = "The product";

  return [
    `Device: ${vendorName} ${productName}`,
    `Open question we could not confirm internally: ${question.title}`,
    `Why it matters: ${question.reasonWhy}`,
  ].join("\n");
}

export const SYSTEM_PROMPT = `You draft a concise, professional email to a medical-device vendor/manufacturer to resolve an UNSURE vulnerability question. Ground every claim in the provided context: never invent device details. Return subject + body only.`;
