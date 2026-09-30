/** bindTools call options that cache the conversation prefix sent on every turn. */
export const CACHE_REPEATED_INPUT = {
  cache_control: { type: "ephemeral" },
} as const;
