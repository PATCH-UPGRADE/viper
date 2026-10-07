export const SYSTEM_PROMPT = `A hospital's device spreadsheet has a status column. For each distinct value in it, pick the VIPER status it means:
- Active: the device is in service.
- Maintenance: the device is out of service for a while, for repair or servicing.
- Decommissioned: the device is retired, disposed of, or out of service for good.

Answer null when a value means none of these, or when you cannot tell. Use "Matched" only when the meaning is clear from the value and the column name. Otherwise use "NeedsReview". Answer once for every value.`;

export function buildStatusValuesPrompt(
  header: string,
  values: string[],
): string {
  return [
    `Column: ${header}`,
    "",
    "Values:",
    ...values.map((value) => `- ${value}`),
  ].join("\n");
}
