import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export interface TicketSeedContext {
  seedUserId: string;
}

type TicketSeed = (context: TicketSeedContext) => Promise<void>;

const TICKET_FOLDER_NAME = /^[A-Z]+-\d+$/;

function ticketNumber(ticket: string) {
  return Number(ticket.split("-")[1]);
}

export function ticketsWithSeeds(devSeedsDirectory: string) {
  return readdirSync(devSeedsDirectory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((folderName) => TICKET_FOLDER_NAME.test(folderName))
    .sort((left, right) => ticketNumber(left) - ticketNumber(right));
}

async function loadTicketSeed(devSeedsDirectory: string, ticket: string) {
  const seedFile = join(devSeedsDirectory, ticket, "index.ts");
  if (!existsSync(seedFile)) {
    throw new Error(`${ticket} has no index.ts in ${devSeedsDirectory}.`);
  }
  const seedModule: { seed?: TicketSeed } = await import(
    pathToFileURL(seedFile).href
  );
  if (typeof seedModule.seed !== "function") {
    throw new Error(`${seedFile} must export an async function named "seed".`);
  }
  return seedModule.seed;
}

export async function seedTicketDemoData(
  devSeedsDirectory: string,
  context: TicketSeedContext,
  onlyTicket: string | null,
) {
  const availableTickets = ticketsWithSeeds(devSeedsDirectory);
  if (onlyTicket && !availableTickets.includes(onlyTicket)) {
    const knownTickets = availableTickets.join(", ") || "none yet";
    throw new Error(
      `No demo seed for ${onlyTicket}. Tickets with a seed folder: ${knownTickets}.`,
    );
  }

  const ticketsToSeed = onlyTicket ? [onlyTicket] : availableTickets;
  for (const ticket of ticketsToSeed) {
    console.log(`\n🌱 Seeding demo data for ${ticket}...`);
    const seedTicket = await loadTicketSeed(devSeedsDirectory, ticket);
    await seedTicket(context);
  }
}
