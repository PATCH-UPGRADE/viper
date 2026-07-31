import "server-only";
import type { ScopedNote } from "@/features/notes/schemas";
import { getScopedNotesByInstance } from "@/features/notes/server/get-relevant-notes";
import type { ScopeTargetModel } from "@/generated/prisma";

// current and future create/edit Note Source
export type NoteActionSource =
  | "MATCH_FEEDBACK"
  | "QUESTION_ANSWER"
  | "CHAT"
  | "NOTIFICATION UPDATE"
  | "ISSUSE_STATUS_CHANGE"
  | "PDF_EXTRACTOR";

export type NoteActionRequest = {
  source: NoteActionSource;
  updatedText: string;
  target: {
    targetModel: ScopeTargetModel;
    instanceId: string;
  };
  targetLabel: string;
  userId: string;
};

export type NoteActionContext = {
  request: NoteActionRequest;
  markdown: string;
  candidates: ScopedNote[];
};

function renderNoteActionPrompt(args: {
  request: NoteActionRequest;
  candidates: ScopedNote[];
}): string {
  const { request, candidates } = args;
  const sections: string[] = [];

  sections.push(`## The updated note is\n\n${request.updatedText.trim()}`);

  sections.push(
    candidates.length === 0
      ? "## Existing notes\n\n(none)"
      : "## Existing notes (update or delete these instead of duplicating)\n\n" +
          candidates.map((n) => `- [${n.id} ${n.text}`).join("\n"),
  );

  sections.push(
    "## Where a new note will attach\n\n" +
      `${request.targetLabel} (${request.target.targetModel}, id: ${request.target.instanceId})`,
  );

  return sections.join("\n\n");
}

export async function gatherNoteActionContext(
  request: NoteActionRequest,
): Promise<NoteActionContext | null> {
  if (!request.updatedText.trim()) return null;

  const { targetModel, instanceId } = request.target;
  const byEntity = await getScopedNotesByInstance(targetModel, [instanceId]);
  const candidates = byEntity.get(instanceId) ?? [];
  const markdown = renderNoteActionPrompt({ request, candidates });

  return { request, markdown, candidates };
}

export const SYSTEM_PROMPT = `You maintain a hospital vulnerability-management team's notes about their medice devices, assets, vulnerabilities, and remediations. Notes are the team's durable memory: they can fed back into every later AI run and shown to staff on the asset, vulnerability, and remediation pages. A user has just taken an action and left a comment.

Your job is to record what they told us, do not judge whether a comment is "important enough" and emit note operations. Any claim about a device, vulnerability, or remediation must come from "what the user said". Never invent a technical or clinical claim the user did not make.

What to record:
- Facts about the hospital's fleet ("the ward 4 infusion pumps were decomissioned in Q3 2024")
- Device configuration, deployment, or exposure specifics ("these ventilators run fireware 3.2, not 4.x")
- Standing operational constraints ("this analyzer can ony be patched during the Sunday 02:00 window")
- Corrections to how a device or vulnerability should be interpreted going forward

Operations:
- "create" - new information, new fact. Provide "text". Omit "noteId".
- "update" - an existing note covers this topic and the comment refines, corrects, or extends it. Provide "noteId" from the Existing notes list and the full replacement "text". Prefer this over creating a near-duplicate.
- "delete" - an existing note is now definitively contradicted or obsolete. Provide "noteId". Refinement is an update, NOT a delete. Only delete when the note would actively mislead a future render.

Rules:
- Only reference note ids that appear in the Existing notes list. Never invent an id.
- Write each note as a standalone statement of fact. Do not mention "the user", "this notification", or the action that produced it. A reader six months from now should understand it with no other context.
- One atomic fact per note. Split a comment carrying two unreleated facts into two creates.
- Always give a one-sentence "reason" for each op.
- When in doubt, do less.
`;
