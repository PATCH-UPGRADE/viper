#!/usr/bin/env tsx

// Runs the mitigation-planning agent against a notification that already
// exists, and prints where each drafted work order would be filed.
//
// In production this runs inside Inngest, from an inbound email or a new
// remediation. Neither is reachable locally: the email flow fetches the message
// back from Resend by id, and the remediation flow makes its own notification.
// This calls the same function those two call, so what runs is the real agent.
//
//   npm run db:plan-notification            # the seeded Siemens advisory
//   npm run db:plan-notification <id>       # any notification
//
// Needs ANTHROPIC_API_KEY. Re-running is safe: persistMitigationPlans deletes
// the un-accepted plans for the notification before it writes new ones, and
// refuses outright once a plan has been accepted.

import Module from "node:module";
import { fileURLToPath } from "node:url";

// Stub server-only, so the agent and the Prisma client can be imported here.
// Every import below must stay dynamic, or it resolves before this runs.
const serverOnlyStub = fileURLToPath(
  new URL("../src/test/server-only-stub.ts", import.meta.url),
);
const mod = Module as unknown as {
  _resolveFilename(request: string, ...rest: unknown[]): string;
};
const resolveFilename = mod._resolveFilename;
mod._resolveFilename = function (request, ...rest) {
  return resolveFilename.call(
    this,
    request === "server-only" ? serverOnlyStub : request,
    ...rest,
  );
};

type Prisma = typeof import("@/lib/db")["default"];

async function reportPlans(prisma: Prisma, notificationId: string) {
  const plans = await prisma.mitigationPlan.findMany({
    where: { notificationId },
    orderBy: { order: "asc" },
    select: {
      title: true,
      order: true,
      workOrders: {
        select: {
          summary: true,
          submissionState: true,
          targetIntegration: { select: { name: true } },
        },
      },
    },
  });

  for (const plan of plans) {
    const recommended = plan.order === 0 ? " (recommended)" : "";
    console.log(`\nPlan ${plan.order + 1}${recommended}: ${plan.title}`);
    for (const workOrder of plan.workOrders) {
      // The whole point of the script: whether a platform was found.
      const destination = workOrder.targetIntegration
        ? `files on ${workOrder.targetIntegration.name} (${workOrder.submissionState})`
        : "tracked in VIPER only";
      console.log(`  - ${workOrder.summary}\n      ${destination}`);
    }
  }
}

async function main() {
  const { persistMitigationPlans } = await import(
    "@/features/inbox/agent/mitigation/persist"
  );
  const { default: prisma } = await import("@/lib/db");

  const notificationId = process.argv[2];
  const notification = await prisma.notification.findFirst({
    where: notificationId
      ? { id: notificationId }
      : { sourceLinks: { some: {} }, vulnerabilities: { some: {} } },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      title: true,
      sourceLinks: { select: { sourceRecordId: true } },
    },
  });

  if (!notification) {
    throw new Error(
      notificationId
        ? `No notification with id ${notificationId}.`
        : "No notification has both a source record and a vulnerability. Run the seed first, or pass an id.",
    );
  }

  const sourceRecordId = notification.sourceLinks[0]?.sourceRecordId;
  if (!sourceRecordId) {
    throw new Error(
      `"${notification.title}" has no source record, and the agent reads its markdown as the advisory text.`,
    );
  }

  console.log(`Planning against: ${notification.title}`);
  console.log("Calling the model. This takes a while.\n");

  const result = await persistMitigationPlans(sourceRecordId, notification.id);

  if ("skipped" in result) {
    const reason =
      result.skipped === "accepted-exists"
        ? "a plan has already been accepted for this notification"
        : "the notification has no vulnerabilities mapped to it";
    console.log(`Skipped: ${reason}.`);
  } else {
    console.log(`Created ${result.plans} plan(s).`);
    if (result.droppedLinks) {
      console.log(
        `${result.droppedLinks} link(s) the model named no longer exist and were dropped.`,
      );
    }
    await reportPlans(prisma, notification.id);
  }

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
