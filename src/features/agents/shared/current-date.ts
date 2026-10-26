/**
 * Today's date for a system prompt. It is a date, not a time, so the prompt
 * stays the same for the whole day and the provider's prompt cache still hits.
 */
export function currentDateBlock(): string {
  return `<current_date>Today is ${new Date().toISOString().slice(0, 10)} (UTC).</current_date>`;
}
