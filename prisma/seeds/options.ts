const SEED_SCOPES = ["all", "production"] as const;

export type SeedScope = (typeof SEED_SCOPES)[number];

export interface SeedOptions {
  scope: SeedScope;
  onlyTicket: string | null;
}

function requestedSeedScope(requestedScope: string): SeedScope {
  const knownScope = SEED_SCOPES.find((scope) => scope === requestedScope);
  if (!knownScope) {
    throw new Error(
      `SEED_SCOPE must be one of: ${SEED_SCOPES.join(", ")}. Got "${requestedScope}".`,
    );
  }
  return knownScope;
}

export function readSeedOptions(environment: NodeJS.ProcessEnv): SeedOptions {
  const scope = requestedSeedScope(environment.SEED_SCOPE ?? "all");
  const onlyTicket = environment.SEED_TICKET?.toUpperCase() ?? null;
  if (scope === "production" && onlyTicket) {
    throw new Error(
      "SEED_TICKET seeds demo data, so it cannot be combined with SEED_SCOPE=production.",
    );
  }
  return { scope, onlyTicket };
}
