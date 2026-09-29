import "server-only";
import type { LinkEntities } from "@/features/inbox/pipeline";
import type { SourceRecordAdapter } from "@/features/inbox/source-adapter";
import prisma from "@/lib/db";
import { resolveMatchingId } from "@/lib/router-utils";
import { resolveOrMintVulnerabilities } from "../vulnerabilities";
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
 * neither link needs a model.
 *
 * An identifier we do not already hold is minted as a Vulnerability on the
 * channel's matching, so triage and VEX see every vulnerability the advisory
 * names. A user who disagrees unlinks it from the Notification.
 */
export const linkAdvisoryEntities =
  (advisory: MedIsaoAdvisoryItem): LinkEntities =>
  (step, notificationId, ctx) =>
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

      if (!ctx) {
        throw new Error(
          "A MedISAO advisory is linked without its SourceRecord",
        );
      }
      const { mapping } = await prisma.sourceRecord.findUniqueOrThrow({
        where: { id: ctx.sourceId },
        select: {
          mapping: {
            select: {
              integrationId: true,
              integration: { select: { integrationUserId: true } },
            },
          },
        },
      });
      if (!mapping) {
        throw new Error(
          `SourceRecord ${ctx.sourceId} has no integration mapping`,
        );
      }

      const { ids, created } = await resolveOrMintVulnerabilities({
        names: advisory.vulnerabilityIds,
        integrationId: mapping.integrationId,
        integrationUserId: mapping.integration.integrationUserId,
        deviceGroupMatchingId,
        context: `Named by MedISAO on the advisory "${advisory.title}". No CVE is assigned.`,
      });

      for (const [name, vulnerabilityId] of ids) {
        const vulnReason = `MedISAO lists ${name} on this advisory.`;
        await prisma.notificationVulnerabilityMapping.upsert({
          where: {
            notificationId_vulnerabilityId: { notificationId, vulnerabilityId },
          },
          create: {
            notificationId,
            vulnerabilityId,
            confidence: "Matched",
            reasonWhy: vulnReason,
          },
          update: { confidence: "Matched", reasonWhy: vulnReason },
        });
      }

      return { linked: 1 + ids.size, updated: 0, created, skipped: 0 };
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
      // MedISAO prints the TLP marking, so it is never inferred.
      known: { tlp: advisory.tlp },
    };
  },
};
