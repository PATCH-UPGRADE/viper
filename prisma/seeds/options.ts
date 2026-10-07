type SeedScope = "auto" | "all" | "production";

export function readSeedScope(environment: NodeJS.ProcessEnv): SeedScope {
  const requestedScope = environment.SEED_SCOPE;
  if (requestedScope === undefined) {
    return "auto";
  }
  if (requestedScope === "all" || requestedScope === "production") {
    return requestedScope;
  }
  throw new Error(
    `SEED_SCOPE must be "all" or "production". Got "${requestedScope}".`,
  );
}
