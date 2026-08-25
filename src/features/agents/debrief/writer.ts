import "server-only";
import { ChatAnthropic } from "@langchain/anthropic";
import { z } from "zod";
import {
  type DebriefBullet,
  debriefBulletDraftSchema,
} from "@/features/debrief/types";
import { buildWriterPrompt, type WriterPromptInput } from "./prompts";
import { validateBullets } from "./validate";

const WRITER_MODEL = "claude-sonnet-5";

/**
 * Deliberately the DRAFT schema, not the strict one — see
 * `debriefBulletDraftSchema` for why. `validateBullets` repairs the result.
 */
const writerOutputSchema = z.object({
  bullets: z.array(debriefBulletDraftSchema).min(1).max(5),
});

export type WriteDebriefResult = {
  bullets: DebriefBullet[];
  model: string;
};

/**
 * Write one department's bullets from the scout's fleet-wide findings.
 *
 * No thinking and no tools: a forced `tool_choice` — which
 * `withStructuredOutput` uses — cannot be combined with extended thinking. The
 * reasoning already happened in the scout; this call only shapes the output.
 */
export async function writeDepartmentDebrief(
  input: WriterPromptInput,
): Promise<WriteDebriefResult> {
  // `thinking: disabled` is REQUIRED here, not a default worth omitting.
  // withStructuredOutput sends a forced tool_choice, and LangChain only skips
  // forcing when thinking.type is explicitly "enabled" or "adaptive". Leave
  // thinking unset and Sonnet 5 still thinks, because omitting the field is its
  // ON default — so the request pairs forced tool choice with thinking, which
  // the API rejects. Every writer call would fail.
  const model = new ChatAnthropic({
    model: WRITER_MODEL,
    maxTokens: 4096,
    thinking: { type: "disabled" },
  }).withStructuredOutput(writerOutputSchema, { name: "emit_debrief" });

  const draft = await model.invoke([
    { role: "user", content: buildWriterPrompt(input) },
  ]);

  const { bullets } = await validateBullets(draft.bullets);

  return { bullets, model: WRITER_MODEL };
}
