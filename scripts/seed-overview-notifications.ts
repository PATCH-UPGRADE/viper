/**
 * Throwaway filler for the Overview page: unread notifications across every
 * priority, so the "Suggested inbox items" card shows its 5-row cap and the
 * Critical → High → Defer → Monitor order.
 *
 * Run:    npx tsx scripts/seed-overview-notifications.ts
 * Clean:  npx tsx scripts/seed-overview-notifications.ts --clean
 *
 * Every row it writes has the TAG prefix in its title, so --clean removes them
 * and nothing else.
 */
import { NotificationType, Priority } from "@/generated/prisma";
import prisma from "../src/lib/db";

const TAG = "[overview-test]";

const ROWS: {
  priority: Priority;
  type: NotificationType;
  title: string;
  minutesAgo: number;
}[] = [
  {
    priority: Priority.Critical,
    type: NotificationType.Advisory,
    title:
      "Baxter Life2000 Ventilation System — multiple critical vulnerabilities",
    minutesAgo: 120,
  },
  {
    priority: Priority.Critical,
    type: NotificationType.Advisory,
    title: "GE SIGNA MRI — DICOM service buffer overflow",
    minutesAgo: 180,
  },
  {
    priority: Priority.High,
    type: NotificationType.Recall,
    title: "Fresenius Kabi Agilia infusion pumps — battery defect recall",
    minutesAgo: 240,
  },
  {
    priority: Priority.High,
    type: NotificationType.UpdateAvailable,
    title: "Philips IntelliVue MX750 — firmware 12.4 available",
    minutesAgo: 300,
  },
  {
    priority: Priority.Defer,
    type: NotificationType.Advisory,
    title: "Dell OptiPlex workstations — BIOS privilege escalation",
    minutesAgo: 20,
  },
  {
    priority: Priority.Monitor,
    type: NotificationType.Other,
    title: "Cisco IOS XE — web UI advisory, no affected assets found",
    minutesAgo: 10,
  },
];

async function clean() {
  const { count } = await prisma.notification.deleteMany({
    where: { title: { startsWith: TAG } },
  });
  console.log(`🗑️  Removed ${count} ${TAG} notifications`);
}

async function seed() {
  const now = Date.now();
  for (const row of ROWS) {
    const at = new Date(now - row.minutesAgo * 60_000);
    await prisma.notification.create({
      data: {
        title: `${TAG} ${row.title}`,
        summary: row.title,
        type: row.type,
        priority: row.priority,
        priorityReasonWhy: "Seeded for Overview page testing.",
        createdAt: at,
        updatedAt: at,
      },
    });
    console.log(`  ✅ ${row.priority.padEnd(8)} ${row.title}`);
  }
  console.log(`\n✨ Added ${ROWS.length} unread notifications`);
}

function assertLocalDatabase() {
  const raw = process.env.DATABASE_URL;
  if (!raw) throw new Error("DATABASE_URL is not set.");
  const { hostname } = new URL(raw);
  if (hostname !== "localhost" && hostname !== "127.0.0.1") {
    throw new Error(
      `Refusing to run: DATABASE_URL points at "${hostname}". This script writes and deletes notifications and only runs against a local database.`,
    );
  }
}

const run = process.argv.includes("--clean") ? clean : seed;
Promise.resolve()
  .then(assertLocalDatabase)
  .then(run)
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
