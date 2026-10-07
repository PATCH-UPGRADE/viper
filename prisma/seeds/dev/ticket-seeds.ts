import { execFileSync } from "node:child_process";
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
const TICKET_AT_START_OF_BRANCH_NAME = /^[a-z]+-\d+/i;

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

function currentBranchName() {
  try {
    const gitOutput = execFileSync("git", ["branch", "--show-current"], {
      cwd: DEV_SEEDS_DIRECTORY,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    return gitOutput.trim();
  } catch {
    return "";
  }
}

function ticketOfBranch(branchName: string) {
  const ticketAtStart = branchName.match(TICKET_AT_START_OF_BRANCH_NAME);
  return ticketAtStart ? ticketAtStart[0].toUpperCase() : null;
}

function ticketsForCurrentBranch(availableTickets: string[]) {
  const branchName = currentBranchName();
  const branchTicket = ticketOfBranch(branchName);
  if (!branchTicket) {
    console.log(
      "🌿 No ticket in the current branch name, so no ticket seed runs.",
    );
    return [];
  }
  if (!availableTickets.includes(branchTicket)) {
    console.log(
      `🌿 Branch ${branchName} has no prisma/seeds/dev/${branchTicket} folder, so no ticket seed runs.`,
    );
    return [];
  }
  console.log(
    `🌿 Branch ${branchName} matches prisma/seeds/dev/${branchTicket}, so that ticket seed runs.`,
  );
  return [branchTicket];
}

export async function loadTicketSeeds(onlyTickets: string[] | null) {
  const availableTickets = ticketsWithSeeds();
  const requestedTickets =
    onlyTickets ?? ticketsForCurrentBranch(availableTickets);
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
