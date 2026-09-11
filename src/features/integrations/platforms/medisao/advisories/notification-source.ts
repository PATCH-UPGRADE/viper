import "server-only";
import type { LinkEntities } from "@/features/inbox/pipeline";
import type { SourceRecordAdapter } from "@/features/inbox/source-adapter";
import prisma from "@/lib/db";
import { resolveMatchingId } from "@/lib/router-utils";
import {
  type MedIsaoAdvisoryItem,
  rawAdvisorySchema,
  toCanonical,
} from "./feed";

const SOURCE_LABEL = "MedISAO";

/**
 * Link the advisory to what it plainly names, with no model in the loop.
 *
 * The email path has to extract device names from prose and then fuzzy-match
 * them. A MedISAO advisory arrives on a channel that already states the
 * manufacturer and product, and names its vulnerabilities by identifier, so
 * both links are a lookup.
 *
 * Vulnerabilities are linked, never created, which is what the email path does
 * too. An identifier we do not already hold is counted as skipped rather than
 * minted, because a Vulnerability row drives issue creation and enrichment.
 */
export const linkAdvisoryEntities =
  (advisory: MedIsaoAdvisoryItem): LinkEntities =>
  (step, notificationId) =>
    step.run("link-channel-entities", async () => {
      if (!notificationId) {
        return { linked: 0, updated: 0, created: 0, skipped: 0 };
      }

      const deviceGroupMatchingId = await resolveMatchingId({
        manufacturer: advisory.manufacturer,
        product: advisory.product,
        version: advisory.version,
        versionRange: advisory.versionRange,
        // The channel is the identity here; nothing came from a CPE.
        hasCpe: false,
      });

      const reasonWhy = `MedISAO publishes this advisory on the ${advisory.manufacturer}${
        advisory.product ? ` ${advisory.product}` : ""
      } channel.`;

      await prisma.notificationDeviceGroupMapping.upsert({
        where: {
          notificationId_deviceGroupMatchingId: {
            notificationId,
            deviceGroupMatchingId,
          },
        },
        // "Matched" and not "Confirmed": confidence records how the link was
        // made, and no human has looked at it.
        create: {
          notificationId,
          deviceGroupMatchingId,
          confidence: "Matched",
          reasonWhy,
        },
        update: { confidence: "Matched", reasonWhy },
      });

      const known = advisory.vulnerabilityIds.length
        ? await prisma.vulnerability.findMany({
            where: { cveId: { in: advisory.vulnerabilityIds } },
            select: { id: true, cveId: true },
          })
        : [];

      for (const vulnerability of known) {
        const vulnReason = `MedISAO lists ${vulnerability.cveId} on this advisory.`;
        await prisma.notificationVulnerabilityMapping.upsert({
          where: {
            notificationId_vulnerabilityId: {
              notificationId,
              vulnerabilityId: vulnerability.id,
            },
          },
          create: {
            notificationId,
            vulnerabilityId: vulnerability.id,
            confidence: "Matched",
            reasonWhy: vulnReason,
          },
          update: { confidence: "Matched", reasonWhy: vulnReason },
        });
      }

      return {
        linked: 1 + known.length,
        updated: 0,
        created: 0,
        skipped: advisory.vulnerabilityIds.length - known.length,
      };
    });

/**
 * What `process-source-record` needs to run a MedISAO advisory through the
 * shared pipeline.
 *
 * The canonical item is re-derived from `raw` rather than stored twice, so the
 * snapshot stays the single copy of what MedISAO actually said. The channel id
 * is not recoverable from `raw`, and only the url builders want it, so the
 * mapping row keeps the endpoint instead.
 */
export const advisorySourceAdapter: SourceRecordAdapter = {
  prepare(raw: unknown) {
    const advisory = toCanonical(rawAdvisorySchema.parse(raw), "", "");
    return {
      doc: {
        from: SOURCE_LABEL,
        subject: advisory.title,
        markdown: advisory.markdown,
      },
      linkEntities: linkAdvisoryEntities(advisory),
    };
  },
};
