import "server-only";

import { createChatModel } from "@/lib/llm/chat-model";
import {
  buildNamePrompt,
  type NameCandidate,
  type NameKind,
  systemPromptFor,
} from "./context";
import {
  buildNameMatchSchema,
  type NameSuggestion,
  toNameSuggestions,
} from "./schema";

export interface SuggestNameMatchesInput {
  kind: NameKind;
  names: string[];
  candidates: NameCandidate[];
}

export async function suggestNameMatches(
  input: SuggestNameMatchesInput,
): Promise<Map<string, NameSuggestion>> {
  const { kind, names, candidates } = input;
  if (names.length === 0 || candidates.length === 0) return new Map();
  const candidateIds = candidates.map((candidate) => candidate.id);
  const schema = buildNameMatchSchema(names, candidateIds);

  const model = createChatModel("csv.match-names").withStructuredOutput(
    schema,
    { method: "functionCalling" },
  );

  const guess = await model.invoke([
    { role: "system", content: systemPromptFor(kind) },
    { role: "user", content: buildNamePrompt(kind, names, candidates) },
  ]);
  return toNameSuggestions(guess, candidateIds);
}
