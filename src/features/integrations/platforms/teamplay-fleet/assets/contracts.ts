import "server-only";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma";
import prisma from "@/lib/db";
import { resolveVendor } from "@/lib/router-utils";
import type { Session } from "../../../core/types";
import { SIEMENS_HEALTHINEERS } from "../config";
import { CONTRACTS_URL } from "../urls";

const fleetContractRowSchema = z.object({
  contractId: z.string(),
  contractNumber: z.string(),
  contractNumberConsolidated: z.string().nullish(),
  contractName: z.string().nullish(),
  equipmentKey: z.string(),
  contractGroup: z.string().nullish(),
  contractStatusId: z.string().nullish(),
  contractStatusDescription: z.string().nullish(),
  contractTypeId: z.string().nullish(),
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
  const contractName = normalizeContractText(row.contractName);
  const header = contractName
    ? `Serviced by Siemens Healthineers under Fleet contract ${row.contractNumber} (${contractName}).`
    : `Serviced by Siemens Healthineers under Fleet contract ${row.contractNumber}, which Fleet lists without a name.`;
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

export interface FleetContractsOutcome {
  contractedAssetIds: Set<string>;
  errorMessage: string | null;
}

export async function syncFleetContracts(
  session: Session,
  integrationId: string,
): Promise<FleetContractsOutcome> {
  let rows: FleetContractRow[];
  let vendorId: string;
  try {
    rows = await listContracts(session);
    if (rows.length === 0) {
      return { contractedAssetIds: new Set(), errorMessage: null };
    }
    vendorId = (await resolveVendor(SIEMENS_HEALTHINEERS)).id;
  } catch (error) {
    return {
      contractedAssetIds: new Set(),
      errorMessage: error instanceof Error ? error.message : "Unknown error",
    };
  }

  const contractedAssetIds = new Set<string>();
  const errors: string[] = [];

  for (const row of rows) {
    try {
      const mapping = await prisma.externalAssetMapping.findFirst({
        where: { integrationId, externalId: row.equipmentKey },
        select: { itemId: true },
      });
      if (!mapping) continue;

      const terms = await getContractTerms(
        session,
        row.contractNumber,
        row.equipmentKey,
      );
      const responsibilities = buildResponsibilities(row, terms);

      await prisma.$transaction(async (tx) => {
        const existingContract = await tx.contract.findUnique({
          where: { id: row.contractId },
          select: { managesRelationshipId: true },
        });
        const relationshipId =
          existingContract?.managesRelationshipId ??
          (
            await tx.managesRelationship.create({
              data: {
                responsibilities,
                vendorId,
                workOrderIntegrationId: integrationId,
              },
            })
          ).id;

        const contractFields = {
          title: normalizeContractText(row.contractName),
          effectiveFrom: fleetContractDate(row.startDate),
          effectiveTo: fleetContractDate(row.expirationDate),
          termsJson: buildTermsJson(row, terms),
          managesRelationshipId: relationshipId,
        };
        await tx.contract.upsert({
          where: { id: row.contractId },
          create: { id: row.contractId, vendorId, ...contractFields },
          update: contractFields,
        });

        const assetAlreadyConnected = await tx.managesRelationship.findFirst({
          where: {
            id: relationshipId,
            assets: { some: { id: mapping.itemId } },
          },
          select: { id: true },
        });
        await tx.managesRelationship.update({
          where: { id: relationshipId },
          data: {
            responsibilities,
            ...(assetAlreadyConnected
              ? {}
              : { assets: { connect: { id: mapping.itemId } } }),
          },
        });
      });
      contractedAssetIds.add(mapping.itemId);
    } catch (error) {
      console.error("fleet contract sync failed", {
        contractNumber: row.contractNumber,
        error,
      });
      errors.push(error instanceof Error ? error.message : "Unknown error");
    }
  }

  return {
    contractedAssetIds,
    errorMessage:
      errors.length > 0
        ? `${errors.length} of ${rows.length} contracts failed: ${errors[0]}`
        : null,
  };
}
