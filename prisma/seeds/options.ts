type SeedScope = "auto" | "all" | "production";

interface SeedOptions {
  scope: SeedScope;
  onlyTickets: string[] | null;
}

function requestedSeedScope(requestedScope: string | undefined): SeedScope {
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

function requestedTickets(requestedTicketList: string | undefined) {
  if (!requestedTicketList) {
    return null;
  }
  const ticketCodes = requestedTicketList
    .split(",")
    .map((ticketCode) => ticketCode.trim().toUpperCase());
  const namedTickets = ticketCodes.filter((ticketCode) => ticketCode !== "");
  return namedTickets.length > 0 ? namedTickets : null;
}

export function readSeedOptions(environment: NodeJS.ProcessEnv): SeedOptions {
  const scope = requestedSeedScope(environment.SEED_SCOPE);
  const onlyTickets = requestedTickets(environment.SEED_TICKET);
  if (scope === "production" && onlyTickets) {
    throw new Error(
      "SEED_TICKET seeds demo data, so it cannot be combined with SEED_SCOPE=production.",
    );
  }
  return { scope, onlyTickets };
}
