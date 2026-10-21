import { z } from "zod";
import { type LlmConfidence, llmConfidenceSchema } from "../../contract";

export interface NameSuggestion {
  id: string;
  confidence: LlmConfidence;
  reason: string;
}

export function buildNameMatchSchema(names: string[], candidateIds: string[]) {
  const offeredNames = [...new Set(names)] as [string, ...string[]];
  const offeredIds = [...new Set(candidateIds)] as [string, ...string[]];
  return z.object({
    matches: z.array(
      z.object({
        name: z
          .enum(offeredNames)
          .describe("The name exactly as it appears in the spreadsheet."),
        id: z
          .enum(offeredIds)
          .nullable()
          .describe(
            "The id of the listed VIPER name that is the same, or null.",
          ),
        confidence: llmConfidenceSchema,
        reason: z
          .string()
          .describe("One short sentence a biomedical engineer can check."),
      }),
    ),
  });
}

export type NameMatchGuess = z.infer<ReturnType<typeof buildNameMatchSchema>>;

export function toNameSuggestions(
  guess: NameMatchGuess,
  candidateIds: string[],
): Map<string, NameSuggestion> {
  const offeredIds = new Set(candidateIds);
  const suggestionByName = new Map<string, NameSuggestion>();
  for (const match of guess.matches) {
    if (match.id === null || !offeredIds.has(match.id)) continue;
    if (suggestionByName.has(match.name)) continue;
    suggestionByName.set(match.name, {
      id: match.id,
      confidence: match.confidence,
      reason: match.reason,
    });
  }
  return suggestionByName;
}
