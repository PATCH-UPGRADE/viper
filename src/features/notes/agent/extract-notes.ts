// Reads a chunk of vendor device documentation (extracted PDF text) and emits
// structured create/update operations against Note records. Large PDFs are
// split into text chunks upstream (see ../server/artifact-notes) and fed here
// sequentially so a fact spanning chunks isn't duplicated.

import "server-only";
import { ChatAnthropic } from "@langchain/anthropic";
import { z } from "zod";

const MODEL = "claude-haiku-4-5-20251001";

/** A single note the model wants to create, or an update to an existing one. */
export const noteOpSchema = z.object({
  action: z.enum(["create", "update"]),
  // Present (and required) only for `update`: the id of an existing note from
  // the provided list. Ignored for `create`.
  noteId: z.string().nullish(),
  text: z.string().min(1),
});
export type NoteOp = z.infer<typeof noteOpSchema>;

export const noteOpsSchema = z.object({
  notes: z.array(noteOpSchema),
});
export type NoteOps = z.infer<typeof noteOpsSchema>;

/** An existing note offered to the model as an update/dedupe candidate. */
export type ExistingNote = { id: string; text: string };

const SYSTEM_PROMPT = `You extract durable security facts about a medical device from an excerpt of its vendor documentation.

Focus ONLY on facts useful for vulnerability management and hardening, such as:
- Device hardening guidance and secure-configuration options
- Attack surface: exposed network services, ports, protocols, wireless/physical interfaces
- Authentication: default credentials, password policy, certificate/key handling
- Network exposure and segmentation guidance
- Compensating controls, mitigations, and known operational constraints
- Patch/update mechanism and any constraints (e.g. requires downtime, vendor-signed)

Rules:
- Emit each fact as its own concise, self-contained note (one atomic fact per note). No preamble.
- Ignore marketing copy, legal boilerplate, and clinical/usage instructions unrelated to security.
- The text is ONE EXCERPT of a longer document. A list of facts already captured from earlier
  excerpts is provided — do NOT restate any of them.
- You are also given EXISTING NOTES already stored for this device. If a fact you find is
  already represented by one of them, emit an "update" op with that note's id and improved text
  INSTEAD of creating a near-duplicate. Only "update" an id that appears in that list.
- If this excerpt has nothing security-relevant, return an empty list.`;

function existingNotesBlock(existing: ExistingNote[]): string {
  if (existing.length === 0) return "EXISTING NOTES: (none)";
  const lines = existing.map((n) => `- [${n.id}] ${n.text}`).join("\n");
  return `EXISTING NOTES (update these instead of duplicating):\n${lines}`;
}

function alreadyExtractedBlock(facts: string[]): string {
  if (facts.length === 0)
    return "ALREADY CAPTURED FROM EARLIER EXCERPTS: (none)";
  const lines = facts.map((f) => `- ${f}`).join("\n");
  return `ALREADY CAPTURED FROM EARLIER EXCERPTS (do NOT restate):\n${lines}`;
}

/**
 * Run the extraction agent over one text chunk. Returns the raw create/update
 * ops; the caller validates update ids and persists (see planNoteWrites in
 * ../server/artifact-notes).
 */
export async function extractNotesFromChunk(args: {
  chunkText: string;
  existingNotes: ExistingNote[];
  alreadyExtracted: string[];
}): Promise<NoteOps> {
  const { chunkText, existingNotes, alreadyExtracted } = args;

  const model = new ChatAnthropic({
    model: MODEL,
    maxTokens: 4096,
  }).withStructuredOutput(noteOpsSchema);

  const prompt = [
    "Extract security-relevant notes from the following excerpt of device documentation.",
    existingNotesBlock(existingNotes),
    alreadyExtractedBlock(alreadyExtracted),
    `EXCERPT:\n${chunkText}`,
  ].join("\n\n");

  return model.invoke([
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: prompt },
  ]);
}
