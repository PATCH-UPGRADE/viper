import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export interface TicketSeedContext {
  seedUserId: string;
}

type TicketSeed = (context: TicketSeedContext) => Promise<void>;

interface LoadedTicketSeed {
  ticket: string;
  seed: TicketSeed;
}

const DEV_SEEDS_DIRECTORY = __dirname;
const SHARED_FOLDERS = ["base"];
const TICKET_FOLDER_NAME = /^[A-Z]+-\d+$/;

function ticketNumber(ticket: string) {
  return Number(ticket.split("-")[1]);
}

function ticketsWithSeeds() {
  const folderNames = readdirSync(DEV_SEEDS_DIRECTORY, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
  const ticketFolderNames = folderNames.filter(
    (folderName) => !SHARED_FOLDERS.includes(folderName),
  );
  const misnamedFolder = ticketFolderNames.find(
    (folderName) => !TICKET_FOLDER_NAME.test(folderName),
  );
  if (misnamedFolder) {
    throw new Error(
      `prisma/seeds/dev/${misnamedFolder} is not named like a ticket. Use the upper-case ticket code, for example VW-532.`,
    );
  }
  return ticketFolderNames.sort(
    (left, right) => ticketNumber(left) - ticketNumber(right),
  );
}

async function loadTicketSeed(ticket: string): Promise<LoadedTicketSeed> {
  const seedFile = join(DEV_SEEDS_DIRECTORY, ticket, "index.ts");
  if (!existsSync(seedFile)) {
    throw new Error(
      `${seedFile} does not exist. Every ticket folder needs an index.ts.`,
    );
  }
  const seedModule: { seed?: TicketSeed } = await import(
    pathToFileURL(seedFile).href
  );
  if (typeof seedModule.seed !== "function") {
    throw new Error(`${seedFile} must export an async function named "seed".`);
  }
  return { ticket, seed: seedModule.seed };
}

export async function loadTicketSeeds(onlyTickets: string[] | null) {
  const availableTickets = ticketsWithSeeds();
  const requestedTickets = onlyTickets ?? availableTickets;
  const unknownTickets = requestedTickets.filter(
    (ticket) => !availableTickets.includes(ticket),
  );
  if (unknownTickets.length > 0) {
    const knownTickets =
      availableTickets.length > 0 ? availableTickets.join(", ") : "none yet";
    throw new Error(
      `No demo seed for ${unknownTickets.join(", ")}. Tickets with a seed folder: ${knownTickets}.`,
    );
  }

  const ticketsToLoad = availableTickets.filter((ticket) =>
    requestedTickets.includes(ticket),
  );
  const loadedTicketSeeds: LoadedTicketSeed[] = [];
  for (const ticket of ticketsToLoad) {
    loadedTicketSeeds.push(await loadTicketSeed(ticket));
  }
  return loadedTicketSeeds;
}

export async function runTicketSeeds(
  loadedTicketSeeds: LoadedTicketSeed[],
  context: TicketSeedContext,
) {
  for (const { ticket, seed } of loadedTicketSeeds) {
    console.log(`\n🌱 Seeding demo data for ${ticket}...`);
    await seed(context);
  }
}
