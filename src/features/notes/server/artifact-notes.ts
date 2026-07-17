// Deterministic glue for the deviceArtifact -> Note extraction job.

import "server-only";
import type { NoteOp } from "@/features/notes/agent/extract-notes";
import { requestEntityFilterResolve } from "@/inngest/functions/resolve-entity-filters";
import type { PdfAttachment } from "@/lib/agent-messages";
import prisma from "@/lib/db";
import { downloadBufferFromS3, keyFromDownloadUrl } from "@/lib/s3";

/** The latest-version artifact fields we need to decide if it's a readable PDF. */
export type LatestArtifactRef = {
  name: string | null;
  artifactType: string;
  downloadUrl: string | null;
};

/**
 * Only Documentation artifacts whose file is a PDF are processable — the
 * artifact store also holds firmware/binaries and non-PDF docs (e.g. .drawio),
 * which Claude's document block cannot read.
 */
export function isProcessableDocPdf(latest: LatestArtifactRef | null): boolean {
  if (!latest || !latest.downloadUrl) return false;
  if (latest.artifactType !== "Documentation") return false;
  return (latest.name ?? "").toLowerCase().endsWith(".pdf");
}

function isMissingObjectError(err: unknown): boolean {
  const e = err as { name?: string; $metadata?: { httpStatusCode?: number } };
  return e?.name === "NoSuchKey" || e?.$metadata?.httpStatusCode === 404;
}

/**
 * Fetch the device artifact's PDF documentation as base64 attachments.
 *
 * `expected` counts the processable PDFs recorded in the DB; `pdfs` are the
 * ones actually downloadable from S3 right now. When a hosted upload hasn't
 * landed yet, `pdfs.length < expected` — the caller polls on that gap. Only
 * genuinely-missing objects (404) are tolerated; other S3 errors propagate.
 */
export async function fetchArtifactPdfs(
  deviceArtifactId: string,
): Promise<{ expected: number; pdfs: PdfAttachment[] }> {
  const artifact = await prisma.deviceArtifact.findUnique({
    where: { id: deviceArtifactId },
    select: {
      artifacts: {
        select: {
          latestArtifact: {
            select: { name: true, artifactType: true, downloadUrl: true },
          },
        },
      },
    },
  });

  const pdfs: PdfAttachment[] = [];
  let expected = 0;

  for (const wrapper of artifact?.artifacts ?? []) {
    const latest = wrapper.latestArtifact;
    // The second/third clauses only narrow types for TS — isProcessableDocPdf
    // already guarantees a non-null latest with a downloadUrl.
    if (
      !isProcessableDocPdf(latest) ||
      latest === null ||
      !latest.downloadUrl
    ) {
      continue;
    }
    expected++;
    try {
      const buffer = await downloadBufferFromS3(
        keyFromDownloadUrl(latest.downloadUrl),
      );
      pdfs.push({ filename: latest.name, base64: buffer.toString("base64") });
    } catch (err) {
      if (isMissingObjectError(err)) continue; // upload not landed yet
      throw err;
    }
  }

  return { expected, pdfs };
}

export type NoteWrite =
  | { kind: "create"; text: string }
  | { kind: "update"; noteId: string; text: string };

/**
 * Turn raw agent ops into safe write intents. An `update` is honored only when
 * its noteId is one of the candidate notes we actually offered the model;
 * anything else (including hallucinated ids) becomes a `create`.
 */
export function planNoteWrites(
  ops: NoteOp[],
  candidateNoteIds: Set<string>,
): NoteWrite[] {
  const writes: NoteWrite[] = [];
  for (const op of ops) {
    const text = op.text.trim();
    if (!text) continue;
    if (
      op.action === "update" &&
      op.noteId &&
      candidateNoteIds.has(op.noteId)
    ) {
      writes.push({ kind: "update", noteId: op.noteId, text });
    } else {
      writes.push({ kind: "create", text });
    }
  }
  return writes;
}

/**
 * Persist the planned writes. New notes are scoped to the artifact's device
 * group matching(s) via an EntityFilter (resolved into matches by the
 * resolve-entity-filters job). All DB work runs in one transaction; the
 * returned filter ids are resolved by the caller in a separate durable step.
 */
export async function persistArtifactNotes(args: {
  writes: NoteWrite[];
  userId: string;
  matchingIds: string[];
  label: string | null;
}): Promise<{ createdFilterIds: string[]; created: number; updated: number }> {
  const { writes, userId, matchingIds, label } = args;

  return prisma.$transaction(async (tx) => {
    const createdFilterIds: string[] = [];
    let created = 0;
    let updated = 0;

    for (const write of writes) {
      if (write.kind === "update") {
        await tx.note.update({
          where: { id: write.noteId },
          data: { text: write.text },
        });
        updated++;
        continue;
      }

      const note = await tx.note.create({
        data: { text: write.text, status: "SCOPED", userId },
      });
      // Scope the note to the artifact's matching(s). No filter when there are
      // no matchings — the note is created but simply matches nothing.
      if (matchingIds.length > 0) {
        const filter = await tx.entityFilter.create({
          data: {
            noteId: note.id,
            label,
            targetModel: "DEVICE_GROUP_MATCHING",
            filter: { id: { in: matchingIds } },
          },
          select: { id: true },
        });
        createdFilterIds.push(filter.id);
      }
      created++;
    }

    return { createdFilterIds, created, updated };
  });
}

/** Fire resolve events for freshly-created filters (see requestEntityFilterResolve). */
export async function resolveNewFilters(filterIds: string[]): Promise<void> {
  await Promise.all(filterIds.map((id) => requestEntityFilterResolve(id)));
}
