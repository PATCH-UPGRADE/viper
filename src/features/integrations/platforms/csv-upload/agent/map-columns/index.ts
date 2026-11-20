import "server-only";
import { createChatModel } from "@/lib/llm/chat-model";
import { buildColumnPrompt, SYSTEM_PROMPT } from "./context";
import {
  buildColumnMappingSchema,
  type SuggestedFields,
  toSuggestedFields,
} from "./schema";

export async function suggestColumnMapping(
  headers: string[],
  sampleRows: Record<string, string>[],
): Promise<SuggestedFields> {
  const schema = buildColumnMappingSchema(headers);

  const model = createChatModel("csv.map-columns").withStructuredOutput(
    schema,
    { method: "functionCalling" },
  );

  const guess = await model.invoke([
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: buildColumnPrompt(headers, sampleRows) },
  ]);
  return toSuggestedFields(guess);
}
