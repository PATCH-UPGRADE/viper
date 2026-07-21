// Deterministic glue for the deviceArtifact -> Note extraction job.

import "server-only";
import type { NoteOp } from "@/features/notes/agent/extract-notes";
import { requestEntityFilterResolve } from "@/inngest/functions/resolve-entity-filters";
import prisma from "@/lib/db";
import { downloadBufferFromS3, keyFromDownloadUrl } from "@/lib/s3";

// Text-chunk sizing. A vendor manual can run dozens of pages (e.g. the 68-page
// Siemens Cios manual ~= 23k tokens of text), which as image-based PDF document
// blocks would swamp Haiku's window; extracting text and chunking keeps each
// agent call small and cheap. ~40k chars ~= 10k tokens, well within context.
const CHUNK_CHARS = 40_000;
const CHUNK_OVERLAP = 2_000;

/** One device artifact PDF, already extracted to plain text. */
export type ArtifactPdfText = { filename: string | null; text: string };

/** The latest-version artifact fields we need to decide if it's a readable PDF. */
export type LatestArtifactRef = {
  name: string | null;
  artifactType: string;
  downloadUrl: string | null;
};

/**
 * Only Documentation artifacts whose file is a PDF are processable — the
 * artifact store also holds firmware/binaries and non-PDF docs (e.g. .drawio).
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

/** Extract plain text from a PDF buffer. unpdf is imported lazily so unit tests
 * that only touch the pure helpers don't pull in the pdf.js bundle. */
export async function pdfBufferToText(buffer: Buffer): Promise<string> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const { text } = await extractText(pdf, { mergePages: true });
  return Array.isArray(text) ? text.join("\n") : text;
}

/**
 * Split text into overlapping chunks, preferring to break on a newline so we
 * don't cut mid-sentence. Overlap carries context across the boundary.
 */
export function chunkText(
  text: string,
  maxChars: number = CHUNK_CHARS,
  overlapChars: number = CHUNK_OVERLAP,
): string[] {
  const trimmed = text.trim();
  if (trimmed.length === 0) return [];
  if (trimmed.length <= maxChars) return [trimmed];

  const chunks: string[] = [];
  let start = 0;
  while (start < trimmed.length) {
    let end = Math.min(start + maxChars, trimmed.length);
    if (end < trimmed.length) {
      // Break on the last newline in the back half of the window, if any.
      const nl = trimmed.lastIndexOf("\n", end);
      if (nl > start + maxChars * 0.5) end = nl + 1;
    }
    const chunk = trimmed.slice(start, end).trim();
    if (chunk.length > 0) chunks.push(chunk);
    if (end >= trimmed.length) break;
    start = Math.max(end - overlapChars, start + 1);
  }
  return chunks;
}

/**
 * Fetch the device artifact's PDF documentation as extracted text.
 *
 * `expected` counts the processable PDFs recorded in the DB; `pdfs` are the
 * ones actually downloadable from S3 right now. When a hosted upload hasn't
 * landed yet, `pdfs.length < expected` — the caller polls on that gap. Only
 * genuinely-missing objects (404) are tolerated; other S3 errors propagate.
 */
export async function fetchArtifactPdfs(
  deviceArtifactId: string,
): Promise<{ expected: number; pdfs: ArtifactPdfText[] }> {
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

  const pdfs: ArtifactPdfText[] = [];
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
      pdfs.push({ filename: latest.name, text: await pdfBufferToText(buffer) });
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
 * group matching(s): a single matching is attached directly via instanceId (no
 * EntityFilter, so no resolver run is needed), while multiple matchings use an
 * EntityFilter (resolved into matches by the resolve-entity-filters job). All DB
 * work runs in one transaction; the returned filter ids are resolved by the
 * caller in a separate durable step.
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

    // Single matching: attach directly (cheap, no resolver). Zero matchings
    // leaves the note scoped to nothing.
    const directInstanceId = matchingIds.length === 1 ? matchingIds[0] : null;

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
        data: {
          text: write.text,
          status: "SCOPED",
          userId,
          ...(directInstanceId
            ? {
                targetModel: "DEVICE_GROUP_MATCHING",
                instanceId: directInstanceId,
              }
            : {}),
        },
      });

      // More than one matching can't be expressed by a single instanceId, so
      // scope via an EntityFilter for the resolver to materialize.
      if (matchingIds.length > 1) {
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
