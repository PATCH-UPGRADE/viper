type SeedScope = "all" | "production";

interface SeedOptions {
  scope: SeedScope;
  onlyTicket: string | null;
  shouldClearDemoTables: boolean;
}

function requestedSeedScope(requestedScope: string): SeedScope {
  if (requestedScope === "all" || requestedScope === "production") {
    return requestedScope;
  }
  throw new Error(
    `SEED_SCOPE must be "all" or "production". Got "${requestedScope}".`,
  );
}

export function readSeedOptions(environment: NodeJS.ProcessEnv): SeedOptions {
  const scope = requestedSeedScope(environment.SEED_SCOPE ?? "all");
  const onlyTicket = environment.SEED_TICKET?.toUpperCase() ?? null;
  const shouldClearDemoTables = environment.SEED_CLEAR_DB === "true";
  if (scope === "production" && onlyTicket) {
    throw new Error(
      "SEED_TICKET seeds demo data, so it cannot be combined with SEED_SCOPE=production.",
    );
  }
  if (onlyTicket && shouldClearDemoTables) {
    throw new Error(
      "SEED_TICKET skips the base demo data, so it cannot be combined with SEED_CLEAR_DB=true.",
    );
  }
  return { scope, onlyTicket, shouldClearDemoTables };
}
