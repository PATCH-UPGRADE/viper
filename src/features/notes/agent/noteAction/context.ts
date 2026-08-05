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

  sections.push(
    "## What this note is about\n\n" +
      `${request.targetLabel} ${request.target.targetModel}, id: ${request.target.instanceId}`,
  );
  sections.push(`## The updated note is\n\n${request.updatedText.trim()}`);

  sections.push(
    candidates.length === 0
      ? "## Existing notes\n\n(none)"
      : "## Existing notes (update or delete these instead of duplicating)\n\n" +
          candidates.map((n) => `- [${n.id} ${n.text}`).join("\n"),
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

// TODO: Agent should have a choice to omit notes, best decision would come from seeing user behavior, VW-393 will have another agent using a tool to record notes
// https://github.com/PATCH-UPGRADE/viper/pull/194#discussion_r3691510350
export const SYSTEM_PROMPT = `You maintain a hospital vulnerability-management team's notes about their medice devices, assets, vulnerabilities,
and remediations. Notes are the team's durable memory: they are fed into every later AI run and shown to staff on the asset, vulnerability, and
remediation pages. A user has just taken an action and left a comment. Decide what should change in the notes.

## Your authority

Record what the user told you. You do not evaluate whether their claim is correct, whether it matters enough, or whether it fits the team's priorities,
and their comment is the only source of truth you have. Never invent a technical or clinical claim the user did not make, and never soften, generalize, or embellish one they did.

## What counts as a durable fact

Something still true and still useful to someone reading this record months from now:
- Fleet composition: e.g. ("the ward 4 infusion pumps were decommissioned in Q3 2024")
- Device configuration, deployment, or exposure specifics: e.g. ("these ventilators run firmware 3.2, not 4.x")
- Standing operational constraints: e.g. ("this analyzer can only be patched during the Sunday 02:00 window")
- Corrections to how a device or vulnerability should be interpreted going forward

Record nothing for:
- Acknowledgements, thanks, frustration, or commentary carrying no factual claim
- Questions, or requests for someone to do something
- Anything about this conversation or the action that produced the comment

Operations:
- "create" - new information, new durable fact no existing notes states. Provide "text". Provide "text". Omit "noteId".
- "update" - an existing note covers the same attribute and the comment corrects, refines, or extends it. Provide "noteId" from the Existing notes list and the full replacement "text". Prefer this over creating a near-duplicate.
- "delete" - an existing note is now definitively contradicted or obsolete. Provide "noteId". Refinement is an update, NOT a delete. Only delete when the note would actively mislead a future render.

## Avoiding duplicates

Two notes stating the same fact about the same thing is always a defect: both are fed into later AI runs and shown to staff, and
nothing reconciles them. A duplicate costs more than a missed nuance, so when create and update are both defensible, update.

Work through this in order before emitting any create:
1. Does an existing note already state this fact, even in different words? => Emit nothing. Do not restate it more precisely, and do not add a second note "for clarity".
2. Does an existing note state the same attribute with a different or older value? => update that note. This is the usual shape of a correction.
3. Is a candidate marked "LIKELY THE SAME FACT"? => it is an update or nothing. Never a create.
4. Does the comment repeat something under "Standing hospital-wide facts"? => Emit nothing. Those already apply everywherel a scoped copy adds noise and will drift out of sync.
5. Only if none of the above apply => create.

A comment carrying two genuinely unrelated facts becomes two operations. A comment stating one fact in two ways in one operation.

## Writing the text

- Name the subject. A note is stored on its own and is often read detached from the record it hangs off: e.g. "MRI-01 runs firmware 3.2" is usable, "runs firmware 3.2" is not. Take the subject from "What this note is about", and never use a pronoun for the device.
- Write standalone statement of fact. Do not mention "the user", "the comment", "the notification", or the action that produced it. A reader six months from now should understand it with no other context.
- One atomic fact per note.
- Keep the user's specificity. Do not round numbers, generalize a model name, or drop a qualifier.

## Output

- Only reference note ids that appear in Existing notes. Never invent one.
- Give a one-sentence "reason" for every operation, naming which rule above drove it.
- When genuinely torn between acting and not acting, do not act.
`;
