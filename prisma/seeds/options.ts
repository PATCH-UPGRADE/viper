const SEED_SCOPES = ["all", "production"] as const;

export type SeedScope = (typeof SEED_SCOPES)[number];

export function readSeedScope(environment: NodeJS.ProcessEnv): SeedScope {
  const requestedScope = environment.SEED_SCOPE ?? "all";
  const knownScope = SEED_SCOPES.find((scope) => scope === requestedScope);
  if (!knownScope) {
    throw new Error(
      `SEED_SCOPE must be one of: ${SEED_SCOPES.join(", ")}. Got "${requestedScope}".`,
    );
  }
  return knownScope;
}
