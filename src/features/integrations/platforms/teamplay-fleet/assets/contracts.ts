import "server-only";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma";
import type { Session } from "../../../core/types";
import { CONTRACTS_URL } from "../urls";

const fleetContractRowSchema = z.object({
  contractNumber: z.string(),
  contractName: z.string().nullish(),
  equipmentKey: z.string(),
  contractGroup: z.string().nullish(),
  contractTypeDescription: z.string().nullish(),
  startDate: z.string().nullish(),
  expirationDate: z.string().nullish(),
});

export type FleetContractRow = z.infer<typeof fleetContractRowSchema>;

const fleetContractTermSchema = z.object({
  label: z.string(),
  value: z.array(z.string()),
});

export type FleetContractTerm = z.infer<typeof fleetContractTermSchema>;

export async function listContracts(
  session: Session,
): Promise<FleetContractRow[]> {
  const res = await session.request(`${CONTRACTS_URL}?statusFilter=1,2,3`);
  if (!res.ok) {
    throw new Error(`Fleet /contracts returned ${res.status}`);
  }
  return z.array(fleetContractRowSchema).parse(await res.json());
}

export async function getContractTerms(
  session: Session,
  contractNumber: string,
  equipmentKey: string,
): Promise<FleetContractTerm[]> {
  const url = `${CONTRACTS_URL}/${encodeURIComponent(contractNumber)}?equipmentKey=${encodeURIComponent(equipmentKey)}`;
  const res = await session.request(url);
  if (!res.ok) {
    throw new Error(
      `Fleet /contracts/${contractNumber} returned ${res.status}`,
    );
  }
  return z.array(fleetContractTermSchema).parse(await res.json());
}

export function normalizeContractText(
  raw: string | null | undefined,
): string | null {
  if (!raw) return null;
  const collapsed = raw.replace(/\s+/g, " ").trim();
  const withoutTrailingDots = collapsed.replace(/[.\s]+$/, "");
  return withoutTrailingDots || null;
}

export function fleetContractDate(raw: string | null | undefined): Date | null {
  if (!raw) return null;
  const parsed = new Date(`${raw}Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

const SCHEDULE_LABEL = /(START TIME|END TIME|HOURS PER WEEK)$/;

export function buildResponsibilities(
  row: FleetContractRow,
  terms: FleetContractTerm[],
): string {
  const contractName =
    normalizeContractText(row.contractName) ?? "service contract";
  const header = `Serviced by Siemens Healthineers under Fleet contract ${row.contractNumber} (${contractName}).`;
  if (terms.length === 0) return header;

  const termValue = (label: string): string | null => {
    const term = terms.find(
      (candidate) => normalizeContractText(candidate.label) === label,
    );
    return term ? term.value.join(", ") : null;
  };

  const sentences = [header];
  const coverageWindow = termValue("COVERAGE CODE");
  if (coverageWindow) sentences.push(`Coverage: ${coverageWindow}.`);
  const callBack = termValue("Call Back Response");
  if (callBack) sentences.push(`Call-back within ${callBack}.`);
  const onSite = termValue("On site Response");
  if (onSite) sentences.push(`On-site response ${onSite}.`);
  const uptime = termValue("Performance Guarantee");
  if (uptime) sentences.push(`Uptime guarantee ${uptime}.`);

  const covered: string[] = [];
  const notCovered: string[] = [];
  for (const term of terms) {
    const label = normalizeContractText(term.label);
    if (!label || SCHEDULE_LABEL.test(label)) continue;
    const value = term.value.join(", ");
    if (/not covered/i.test(value)) {
      notCovered.push(label);
    } else if (/covered|included/i.test(value)) {
      covered.push(label);
    }
  }
  if (covered.length > 0) sentences.push(`Covered: ${covered.join(", ")}.`);
  if (notCovered.length > 0) {
    sentences.push(`Not covered: ${notCovered.join(", ")}.`);
  }
  return sentences.join(" ");
}

export function buildTermsJson(
  row: FleetContractRow,
  terms: FleetContractTerm[],
): Prisma.InputJsonValue {
  return { contract: row, terms } as Prisma.InputJsonValue;
}
