import { z } from "zod";
import {
  assetStatusSchema,
  llmConfidenceSchema,
  type SuggestMappingOutput,
} from "../../contract";

export function buildStatusValuesSchema(values: string[]) {
  const offeredValues = [...new Set(values)] as [string, ...string[]];
  return z.object({
    values: z.array(
      z.object({
        value: z
          .enum(offeredValues)
          .describe("A value exactly as it appears in the status column."),
        status: assetStatusSchema
          .nullable()
          .describe(
            "The VIPER status this value means, or null when it means none of them.",
          ),
        confidence: llmConfidenceSchema,
      }),
    ),
  });
}

export type StatusValuesGuess = z.infer<
  ReturnType<typeof buildStatusValuesSchema>
>;

export type StatusValueSuggestions = SuggestMappingOutput["statusValues"];

export function toStatusValueSuggestions(
  values: string[],
  guess: StatusValuesGuess,
): StatusValueSuggestions {
  const guessByValue = new Map<string, StatusValuesGuess["values"][number]>();
  for (const valueGuess of guess.values) {
    if (!guessByValue.has(valueGuess.value)) {
      guessByValue.set(valueGuess.value, valueGuess);
    }
  }
  return values.map(
    (value) =>
      guessByValue.get(value) ?? {
        value,
        status: null,
        confidence: "NeedsReview",
      },
  );
}
