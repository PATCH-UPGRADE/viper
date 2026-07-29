import prisma from "../src/lib/db";

const SEED_USER_EMAIL = "user@example.com";

const SYNGO_PLAZA_CVE = "CVE-2024-52334";
const DESERIALIZATION_CVE = "CVE-2022-29875";
const ADVISORY_CVES = [SYNGO_PLAZA_CVE, DESERIALIZATION_CVE];

function assertLocalDatabase() {
  const raw = process.env.DATABASE_URL;
  if (!raw) throw new Error("DATABASE_URL is not set.");
  const { hostname } = new URL(raw);
  if (hostname !== "localhost" && hostname !== "127.0.0.1") {
    throw new Error(
      `Refusing to run: DATABASE_URL points at "${hostname}". This script deletes all notifications and only runs against a local database.`,
    );
  }
}

async function getSeedUser() {
  return prisma.user.findUniqueOrThrow({ where: { email: SEED_USER_EMAIL } });
}

// Deleting the two vulnerabilities is what clears their Issues (Issue.vulnerabilityId
// is onDelete: Cascade). Without it, a previous run's VEX determinations survive and
// the next run measures them instead of its own.
async function resetInboxEnvironment() {
  const notifications = await prisma.notification.deleteMany({});
  const orphanSources = await prisma.notificationSource.deleteMany({
    where: { notificationId: null, workOrderTicketId: null },
  });
  const draftTickets = await prisma.workOrderTicket.deleteMany({
    where: { isDraft: true },
  });
  const vulnerabilities = await prisma.vulnerability.deleteMany({
    where: { cveId: { in: ADVISORY_CVES } },
  });

  console.log(
    `  🧹 removed ${notifications.count} notification(s), ${orphanSources.count} orphan source(s), ${draftTickets.count} draft ticket(s), ${vulnerabilities.count} vulnerability(ies)`,
  );
}

async function printEnvironmentSummary() {
  const failures: string[] = [];

  const notifications = await prisma.notification.count();
  console.log(`\n  notifications                 ${notifications}`);
  if (notifications !== 0) {
    failures.push(
      `expected 0 notifications, found ${notifications} — the pipeline must create them, not this script`,
    );
  }

  for (const cveId of ADVISORY_CVES) {
    const vulnerability = await prisma.vulnerability.findFirst({
      where: { cveId },
      include: { deviceGroupMatchings: true, issues: true },
    });

    if (!vulnerability) {
      console.log(`\n  ${cveId}                (not seeded yet)`);
      continue;
    }

    const matchings = vulnerability.deviceGroupMatchings.length;
    const baseline = vulnerability.issues.filter(
      (issue) => issue.deviceGroupMatchingId !== null,
    ).length;
    const assetLevel = vulnerability.issues.filter(
      (issue) => issue.assetId !== null,
    ).length;

    console.log(`\n  ${cveId}`);
    console.log(`    device group matchings      ${matchings}`);
    console.log(`    baseline issues             ${baseline}`);
    console.log(`    asset-level issues          ${assetLevel}`);

    if (baseline !== matchings) {
      failures.push(
        `${cveId}: ${matchings} matching(s) but ${baseline} baseline issue(s) — the vulnerability must connect its matchings inline in the same create() call`,
      );
    }
    if (assetLevel !== 0) {
      failures.push(
        `${cveId}: ${assetLevel} asset-level issue(s) present — those are the VEX agent's output and must not be seeded`,
      );
    }
  }

  if (failures.length > 0) {
    console.error("\n❌ Environment is not usable:");
    for (const failure of failures) console.error(`   - ${failure}`);
    throw new Error("Seed produced an unusable environment.");
  }

  console.log("\n  ✅ invariants hold");
}

async function main() {
  console.log("🚀 Preparing advisory test environment\n");
  assertLocalDatabase();

  await getSeedUser();
  await resetInboxEnvironment();
  await printEnvironmentSummary();

  console.log("\n✨ Done.");
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  prisma.$disconnect();
  process.exit(1);
});
