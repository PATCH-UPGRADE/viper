import "server-only";

import { createChatModel } from "@/lib/llm/chat-model";
import { buildStatusValuesPrompt, SYSTEM_PROMPT } from "./context";
import {
  buildStatusValuesSchema,
  type StatusValueSuggestions,
  toStatusValueSuggestions,
} from "./schema";

export async function suggestStatusValues(
  header: string,
  values: string[],
): Promise<StatusValueSuggestions> {
  if (values.length === 0) return [];
  const schema = buildStatusValuesSchema(values);

  const model = createChatModel("csv.map-values").withStructuredOutput(schema, {
    method: "functionCalling",
  });
  const guess = await model.invoke([
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: buildStatusValuesPrompt(header, values) },
  ]);
  return toStatusValueSuggestions(values, guess);
}
