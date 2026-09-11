import { Severity } from "@/generated/prisma";
// computeVulnerabilityPriority checking against 7
// The band is from https://www.first.org/cvss/v3.1/specification-document section 5
export function cvssBand(score: number | null | undefined): Severity | null {
  if (score == null || score <= 0) return null;
  if (score >= 9) return Severity.Critical;
  if (score >= 7) return Severity.High;
  if (score >= 4) return Severity.Medium;
  return Severity.Low;
}
