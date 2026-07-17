import "server-only";
import { extractNotesFromArtifact } from "@/features/notes/agent/extract-notes";
import {
  fetchArtifactPdfs,
  persistArtifactNotes,
  planNoteWrites,
  resolveNewFilters,
} from "@/features/notes/server/artifact-notes";
import { getNotesForInstance } from "@/features/notes/server/get-relevant-notes";
import prisma from "@/lib/db";
import { inngest } from "../client";

// On deviceArtifact upload, read the attached PDF documentation and materialize
// security Notes scoped to the artifact's device group matching(s). Triggered
// from the create mutation; see requestArtifactNoteExtraction.

const EXTRACT_EVENT = "device-artifact/notes.extract.requested" as const;

// Hosted uploads land in S3 after `create` returns, with no completion signal,
// so we poll for the PDF(s) before extracting.
const POLL_INTERVAL = "1m";
const MAX_ATTEMPTS = 15;

/** Ask the extractor to process one device artifact's documentation. */
export async function requestArtifactNoteExtraction(
  deviceArtifactId: string,
): Promise<void> {
  await inngest.send({ name: EXTRACT_EVENT, data: { deviceArtifactId } });
}

export const extractArtifactNotesFn = inngest.createFunction(
  {
    id: "extract-artifact-notes",
    // One extraction at a time per artifact so retries/overlaps can't create
    // duplicate notes.
    concurrency: { key: "event.data.deviceArtifactId", limit: 1 },
  },
  { event: EXTRACT_EVENT },
  async ({ event, step, logger }) => {
    const { deviceArtifactId } = event.data as { deviceArtifactId: string };

    const artifact = await step.run("fetch-artifact", () =>
      prisma.deviceArtifact.findUnique({
        where: { id: deviceArtifactId },
        select: {
          id: true,
          userId: true,
          role: true,
          deviceGroupMatchings: { select: { id: true } },
        },
      }),
    );

    if (!artifact) return { skipped: true, reason: "artifact not found" };
    const matchingIds = artifact.deviceGroupMatchings.map((m) => m.id);

    // Poll until every processable PDF is downloadable, then extract in the same
    // step (the base64 is consumed by the LLM here; only small ops are
    // returned, keeping step output within Inngest's size limit).
    let extraction: { ops: unknown[]; candidateIds: string[] } | null = null;

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const res = await step.run(`extract-attempt-${attempt}`, async () => {
        const { expected, pdfs } = await fetchArtifactPdfs(deviceArtifactId);
        if (expected === 0) return { status: "no-pdfs" as const };
        if (pdfs.length < expected) {
          return {
            status: "not-ready" as const,
            expected,
            available: pdfs.length,
          };
        }

        const existing = await getNotesForInstance(
          "DEVICE_GROUP_MATCHING",
          matchingIds,
        );
        const { notes } = await extractNotesFromArtifact({
          pdfs,
          existingNotes: existing.map((n) => ({ id: n.id, text: n.text })),
        });
        return {
          status: "ok" as const,
          ops: notes,
          candidateIds: existing.map((n) => n.id),
        };
      });

      if (res.status === "no-pdfs") {
        return { skipped: true, reason: "no PDF documentation" };
      }
      if (res.status === "ok") {
        extraction = { ops: res.ops, candidateIds: res.candidateIds };
        break;
      }

      logger.info(
        `Artifact ${deviceArtifactId} PDFs not ready (${res.available}/${res.expected}); waiting`,
      );
      if (attempt < MAX_ATTEMPTS - 1) {
        await step.sleep(`wait-${attempt}`, POLL_INTERVAL);
      }
    }

    if (!extraction) {
      return { skipped: true, reason: "PDFs never became available" };
    }

    const writes = planNoteWrites(
      // ops are validated by the agent's Zod schema before reaching here.
      extraction.ops as Parameters<typeof planNoteWrites>[0],
      new Set(extraction.candidateIds),
    );

    const result = await step.run("persist-notes", () =>
      persistArtifactNotes({
        writes,
        userId: artifact.userId,
        matchingIds,
        label: artifact.role ?? null,
      }),
    );

    if (result.createdFilterIds.length > 0) {
      await step.run("resolve-filters", () =>
        resolveNewFilters(result.createdFilterIds),
      );
    }

    return {
      deviceArtifactId,
      created: result.created,
      updated: result.updated,
    };
  },
);
