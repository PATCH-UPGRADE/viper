import "server-only";
import { searchCandidates } from "@/features/inbox/agent/candidate-search";
import {
  type ExtractResult,
  extractEntities,
} from "@/features/inbox/agent/extract";
import { matchAndLinkEntities } from "@/features/inbox/agent/match";
import type { LinkEntities } from "@/features/inbox/pipeline";
import type { SourceRecordAdapter } from "@/features/inbox/source-adapter";
import prisma from "@/lib/db";
import { SIEMENS_HEALTHINEERS } from "../config";
import {
  type FleetAdvisoryItem,
  fleetAdvisoryRecordSchema,
  parseCveIds,
  toCanonical,
} from "./advisories";

const SOURCE_LABEL = `${SIEMENS_HEALTHINEERS} teamplay Fleet`;

export const linkAdvisoryVulnerabilities =
  (advisory: FleetAdvisoryItem): LinkEntities =>
  (step, notificationId) =>
    step.run("link-advisory-vulnerabilities", async () => {
      const cveIds = [
        ...new Set(
          parseCveIds(advisory.raw.cveIds).map((id) => id.toUpperCase()),
        ),
      ];
      if (!notificationId || cveIds.length === 0) {
        return { linked: 0, skipped: 0 };
      }
      const known = await prisma.vulnerability.findMany({
        where: { cveId: { in: cveIds } },
        select: { id: true, cveId: true },
      });
      const label = advisory.raw.advisoryId ?? `advisory ${advisory.vendorId}`;

      await prisma.notificationVulnerabilityMapping.createMany({
        data: known.map((vulnerability) => ({
          notificationId,
          vulnerabilityId: vulnerability.id,
          confidence: "Matched" as const,
          reasonWhy:
            `teamplay Fleet lists ${vulnerability.cveId}` + ` on ${label}.`,
        })),
        skipDuplicates: true,
      });
      await prisma.notificationVulnerabilityMapping.updateMany({
        where: {
          notificationId,
          vulnerabilityId: { in: known.map((v) => v.id) },
          confidence: "NeedsReview",
        },
        data: { confidence: "Matched" },
      });

      return { linked: known.length, skipped: cveIds.length - known.length };
    });

const withSiemensManufacturer = (extracted: ExtractResult): ExtractResult => ({
  ...extracted,
  deviceGroups: extracted.deviceGroups.map((group) => ({
    ...group,
    manufacturer: group.manufacturer ?? SIEMENS_HEALTHINEERS,
  })),
});

export const advisorySourceAdapter: SourceRecordAdapter = {
  prepare(raw: unknown) {
    const advisory = toCanonical(fleetAdvisoryRecordSchema.parse(raw));

    const doc = {
      from: SOURCE_LABEL,
      subject: advisory.raw.advisoryId
        ? `${advisory.raw.advisoryId}` + `: ${advisory.title}`
        : advisory.title,
      markdown:
        `Manufacturer: ${SIEMENS_HEALTHINEERS}` + `\n\n${advisory.body}`,
    };

    const extractAndMatch: LinkEntities = async (step, notificationId, ctx) => {
      if (!ctx) throw new Error("Fleet adapter needs the pipeline ctx");

      const extracted = await step.run("extract-entities", async () =>
        withSiemensManufacturer(
          await extractEntities(ctx.sourceId, doc, ctx.attachments),
        ),
      );

      return step.run("match-and-link-entities", async () => {
        if (
          !notificationId ||
          Object.values(extracted).every((v) => v.length === 0)
        ) {
          return { linked: 0, updated: 0, created: 0, skipped: 0 };
        }
        const candidates = await searchCandidates(extracted);
        return matchAndLinkEntities({ notificationId }, extracted, candidates);
      });
    };

    const linkVulnerabilities = linkAdvisoryVulnerabilities(advisory);
    return {
      doc,
      linkEntities: async (step, notificationId, ctx) => ({
        matched: await extractAndMatch(step, notificationId, ctx),
        vulnerabilities: await linkVulnerabilities(step, notificationId, ctx),
      }),
    };
  },
};
