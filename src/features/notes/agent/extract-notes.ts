// Reads vendor device documentation (PDF) and emits structured create/update
// operations against Note records. The PDF rides along as a native Anthropic
// `document` block (no text extraction / chunking) — see @/lib/agent-messages.

import "server-only";
import { ChatAnthropic } from "@langchain/anthropic";
import { z } from "zod";
import { buildUserMessage, type PdfAttachment } from "@/lib/agent-messages";

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

const SYSTEM_PROMPT = `You extract durable security facts about a medical device from its vendor documentation.

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
- You are given a list of EXISTING NOTES already attached to this device. If a fact you find is
  already represented by one of them, emit an "update" op with that note's id and improved text
  INSTEAD of creating a near-duplicate. Only "update" an id that appears in the list.
- If you find nothing security-relevant, return an empty list.`;

function existingNotesBlock(existing: ExistingNote[]): string {
  if (existing.length === 0) return "EXISTING NOTES: (none)";
  const lines = existing.map((n) => `- [${n.id}] ${n.text}`).join("\n");
  return `EXISTING NOTES (update these instead of duplicating):\n${lines}`;
}

/**
 * Run the extraction agent over one device artifact's PDFs. Returns the raw
 * create/update ops; the caller is responsible for validating update ids and
 * persisting (see planNoteWrites in ../server/artifact-notes).
 */
export async function extractNotesFromArtifact(args: {
  pdfs: PdfAttachment[];
  existingNotes: ExistingNote[];
}): Promise<NoteOps> {
  const { pdfs, existingNotes } = args;

  const model = new ChatAnthropic({
    model: MODEL,
    maxTokens: 4096,
  }).withStructuredOutput(noteOpsSchema);

  const prompt = [
    "Extract security-relevant notes from the attached device documentation.",
    existingNotesBlock(existingNotes),
  ].join("\n\n");

  return model.invoke([
    { role: "system", content: SYSTEM_PROMPT },
    buildUserMessage(prompt, pdfs),
  ]);
}
