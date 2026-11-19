import "server-only";
import { ChatOpenAI } from "@langchain/openai";
import { z } from "zod";
import {
  type DebriefBullet,
  debriefBulletDraftSchema,
} from "@/features/debrief/types";
import { createChatModel, resolveModelId } from "@/lib/llm/chat-model";
import { buildWriterPrompt, type WriterPromptInput } from "./prompts";
import { validateBullets } from "./validate";

/**
 * Deliberately the DRAFT schema, not the strict one — see
 * `debriefBulletDraftSchema` for why. `validateBullets` repairs the result.
 */
const writerOutputSchema = z.object({
  bullets: z.array(debriefBulletDraftSchema),
});

export type WriteDebriefResult = {
  bullets: DebriefBullet[];
  model: string;
};

/**
 * Write one department's bullets from the scout's fleet-wide findings.
 *
 * Low reasoning effort and no tools: the reasoning already happened in the
 * scout; this call only shapes the output.
 */
export async function writeDepartmentDebrief(
  input: WriterPromptInput,
): Promise<WriteDebriefResult> {
  // "low" is the lowest effort Sol accepts. Reasoning tokens still count toward
  // maxTokens, so leave room above the bullets themselves.

  const model = createChatModel("debrief.writer").withStructuredOutput(
    writerOutputSchema,
    {
      name: "emit_debrief",
      method: "functionCalling",
    },
  );

  const draft = await model.invoke([
    { role: "user", content: buildWriterPrompt(input) },
  ]);

  const { bullets } = await validateBullets(draft.bullets);

  return { bullets, model: resolveModelId("debrief.writer") };
}
