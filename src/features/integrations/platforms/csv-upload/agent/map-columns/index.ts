import "server-only";
import { ChatOpenAI } from "@langchain/openai";
import { buildColumnPrompt, SYSTEM_PROMPT } from "./context";
import {
  buildColumnMappingSchema,
  type SuggestedFields,
  toSuggestedFields,
} from "./schema";

const MODEL = "gpt-6-luna";

export async function suggestColumnMapping(
  headers: string[],
  sampleRows: Record<string, string>[],
): Promise<SuggestedFields> {
  const schema = buildColumnMappingSchema(headers);
  const model = new ChatOpenAI({
    model: MODEL,
    useResponsesApi: true,
    reasoning: { effort: "none" },
    maxTokens: 2000,
  }).withStructuredOutput(schema, { method: "functionCalling" });

  const guess = await model.invoke([
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: buildColumnPrompt(headers, sampleRows) },
  ]);
  return toSuggestedFields(guess);
}
