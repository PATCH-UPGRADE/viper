/**
 * Helper function to build markdown row
 */
export const buildRow = (label: string, value: string | null): string | null =>
  value ? `- ${label}: ${value}` : null;

/**
 * Helper function to build markdown text, when Fleet gave us nothing usable.
 */
export const buildText = (value: string | null | undefined): string | null =>
  value?.trim() || null;
