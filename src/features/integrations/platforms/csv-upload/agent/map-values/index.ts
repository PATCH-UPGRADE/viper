import "server-only";
import { ChatOpenAI } from "@langchain/openai";
import { buildStatusValuesPrompt, SYSTEM_PROMPT } from "./context";
import {
  buildStatusValuesSchema,
  type StatusValueSuggestions,
  toStatusValueSuggestions,
} from "./schema";

const MODEL = "gpt-6-luna";

export async function suggestStatusValues(
  header: string,
  values: string[],
): Promise<StatusValueSuggestions> {
  if (values.length === 0) return [];
  const schema = buildStatusValuesSchema(values);
  const model = new ChatOpenAI({
    model: MODEL,
    useResponsesApi: true,
    reasoning: { effort: "none" },
    maxTokens: 2000,
  }).withStructuredOutput(schema, { method: "functionCalling" });

  const guess = await model.invoke([
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: buildStatusValuesPrompt(header, values) },
  ]);
  return toStatusValueSuggestions(values, guess);
}
