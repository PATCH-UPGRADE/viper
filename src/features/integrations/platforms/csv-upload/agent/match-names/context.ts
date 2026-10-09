import type { z } from "zod";
import type { searchNamesInputSchema } from "../../contract";

export type NameKind = z.infer<typeof searchNamesInputSchema>["kind"];

export interface NameCandidate {
  id: string;
  displayName: string;
  aliases: string[];
}

const SYSTEM_PROMPTS: Record<NameKind, string> = {
  manufacturer: `A hospital's device spreadsheet names manufacturers in its own spelling. For each spreadsheet name, pick the listed VIPER manufacturer that is the same company, including the same company under a former or parent name. Answer null when none is. Never pick a company that is only similar.

Examples:
- "Becton Dickinson" is BD: the same company, written in full.
- "Philips Medical Systems" is Philips: the same company under a former name.
- "Draeger Medical" is Dräger: the same company, spelled without the umlaut.
- "GE Medical Systems" is GE Healthcare: the same company under a former name.
- "Siemens Energy" is not Siemens Healthineers: a different company with a similar name. Answer null.
- "Northwind Biomedical" with no listed company like it: answer null.

Use "Matched" only when you are sure. Otherwise use "NeedsReview". A person reviews every answer.`,
  product: `A hospital's device spreadsheet names device models in its own spelling. All the names below are made by one manufacturer, and so are all the listed VIPER products. For each spreadsheet name, pick the listed VIPER product that is the same model, written differently. Answer null when none is. Never pick a different model, or a different version of the same model line.

Examples:
- "MP5" is IntelliVue MP5: the same model without its family name.
- "Alaris PC Unit 8015" is Alaris 8015: the same model, written in full.
- "LOGIQ-E" is LOGIQ e: the same model, punctuated differently.
- "IntelliVue MX450" is not IntelliVue MX550: a different model in the same family. Answer null.
- "Sigma Spectrum v6" is not Sigma Spectrum v8: a different version of the same model line. Answer null.

Use "Matched" only when you are sure. Otherwise use "NeedsReview". A person reviews every answer.`,
};

export const systemPromptFor = (kind: NameKind): string => SYSTEM_PROMPTS[kind];

export function buildNamePrompt(
  kind: NameKind,
  names: string[],
  candidates: NameCandidate[],
): string {
  const candidateLines = candidates.map((candidate) => {
    const alsoKnownAs =
      candidate.aliases.length > 0
        ? ` (also known as: ${candidate.aliases.join(", ")})`
        : "";
    return `- ${candidate.id}: ${candidate.displayName}${alsoKnownAs}`;
  });
  const listHeading =
    kind === "manufacturer" ? "VIPER manufacturers:" : "VIPER products:";
  return [
    "Spreadsheet names:",
    ...names.map((name) => `- ${name}`),
    "",
    listHeading,
    ...candidateLines,
  ].join("\n");
}
