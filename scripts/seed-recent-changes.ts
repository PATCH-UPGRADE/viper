/**
 * Seeds the trailing-24h data behind the Overview "Updates in the Last Day"
 * card: notifications (advisories / recalls), work-order status changes, and
 * newly added assets.
 *
 * It deliberately seeds one advisory whose matching resolves to NO assets, so
 * the "only notifications with assets in inventory" filter is observable — that
 * one must not appear on the card.
 *
 * Run:    npx tsx scripts/seed-recent-changes.ts
 * Clean:  npx tsx scripts/seed-recent-changes.ts --clean
 *
 * Everything it writes carries the TAG, so --clean removes exactly that.
 */
import {
  ConfidenceLevel,
  NotificationType,
  Priority,
  TicketActivityType,
  TicketStatus,
} from "@/generated/prisma";
import prisma from "../src/lib/db";

const TAG = "[recent-changes-test]";
const SEED_USER_EMAIL = "user@example.com";

const hoursAgo = (hours: number) => new Date(Date.now() - hours * 3_600_000);

function assertLocalDatabase() {
  const raw = process.env.DATABASE_URL;
  if (!raw) throw new Error("DATABASE_URL is not set.");
  const { hostname } = new URL(raw);
  if (hostname !== "localhost" && hostname !== "127.0.0.1") {
    throw new Error(
      `Refusing to run: DATABASE_URL points at "${hostname}". This script writes and deletes data and only runs against a local database.`,
    );
  }
}

async function clean() {
  const notifications = await prisma.notification.deleteMany({
    where: { title: { startsWith: TAG } },
  });
  const assets = await prisma.asset.deleteMany({
    where: { hostname: { startsWith: TAG } },
  });
  // Activities are keyed by the marker we stored in their JSON payload.
  const activities = await prisma.ticketActivity.deleteMany({
    where: { data: { path: ["seedTag"], equals: TAG } },
  });
  // Matchings are left alone: they are plain manufacturer/product rules that
  // `findOrCreateMatching` reuses rather than duplicating.
  console.log(
    `🗑️  Removed ${notifications.count} notifications, ${assets.count} assets, ${activities.count} activities`,
  );
}

async function seed() {
  const user = await prisma.user.findUniqueOrThrow({
    where: { email: SEED_USER_EMAIL },
    select: { id: true },
  });

  // A device group that genuinely holds assets — notifications pointed at it
  // must survive the inventory filter.
  const owned = await prisma.deviceGroup.findFirstOrThrow({
    where: {
      assets: { some: {} },
      manufacturerId: { not: null },
      productId: { not: null },
    },
    select: {
      id: true,
      manufacturerId: true,
      productId: true,
      manufacturer: { select: { canonicalDisplayName: true } },
      product: { select: { canonicalDisplayName: true } },
      _count: { select: { assets: true } },
    },
  });

  // A manufacturer with nothing on the floor — the control case.
  const unowned = await prisma.manufacturer.upsert({
    where: { canonicalName: "acme imaging (unstocked)" },
    update: {},
    create: {
      canonicalName: "acme imaging (unstocked)",
      canonicalDisplayName: "Acme Imaging",
    },
    select: { id: true },
  });

  /**
   * A manufacturer/product rule with no version constraint, so it applies to
   * every version of that product. Do NOT set `versionRange` here as a seed
   * marker: matching resolution evaluates it, and an unparseable range makes
   * the matching resolve to zero assets.
   */
  const findOrCreateMatching = async (
    manufacturerId: string,
    productId: string | null,
  ) => {
    const where = {
      manufacturerId,
      productId,
      versionId: null,
      versionRange: null,
    };
    const existing = await prisma.deviceGroupMatching.findFirst({
      where,
      select: { id: true },
    });
    return (
      existing ??
      (await prisma.deviceGroupMatching.create({
        data: where,
        select: { id: true },
      }))
    );
  };

  const ownedMatching = await findOrCreateMatching(
    owned.manufacturerId as string,
    owned.productId,
  );
  const unownedMatching = await findOrCreateMatching(unowned.id, null);

  const label = `${owned.manufacturer?.canonicalDisplayName} ${owned.product?.canonicalDisplayName}`;

  const notifications: {
    type: NotificationType;
    priority: Priority;
    title: string;
    matchingId: string;
    hours: number;
  }[] = [
    {
      type: NotificationType.Advisory,
      priority: Priority.Critical,
      title: `${label} — remote code execution in imaging service`,
      matchingId: ownedMatching.id,
      hours: 2,
    },
    {
      type: NotificationType.Advisory,
      priority: Priority.High,
      title: `${label} — weak TLS configuration`,
      matchingId: ownedMatching.id,
      hours: 5,
    },
    {
      type: NotificationType.Recall,
      priority: Priority.High,
      title: `${label} — power supply defect recall`,
      matchingId: ownedMatching.id,
      hours: 9,
    },
    {
      // Second control: the card has no chip for UpdateAvailable, so this must
      // not appear either — even though it does resolve to owned assets.
      type: NotificationType.UpdateAvailable,
      priority: Priority.Monitor,
      title: `${label} — firmware v4.2 available (TYPE NOT ON CARD)`,
      matchingId: ownedMatching.id,
      hours: 14,
    },
    {
      // Control: matches a manufacturer the hospital owns nothing from, so the
      // card must NOT show it.
      type: NotificationType.Advisory,
      priority: Priority.Critical,
      title: "Acme Imaging CT-9000 — hardcoded credentials (NOT IN INVENTORY)",
      matchingId: unownedMatching.id,
      hours: 3,
    },
  ];

  for (const row of notifications) {
    const at = hoursAgo(row.hours);
    await prisma.notification.create({
      data: {
        title: `${TAG} ${row.title}`,
        summary: row.title,
        type: row.type,
        priority: row.priority,
        createdAt: at,
        updatedAt: at,
        deviceGroupsMatchings: {
          create: {
            deviceGroupMatchingId: row.matchingId,
            confidence: ConfidenceLevel.Matched,
          },
        },
      },
    });
    console.log(`  ✅ ${row.type.padEnd(16)} ${row.title.slice(0, 58)}`);
  }

  // Work orders that changed status inside the window.
  const tickets = await prisma.workOrderTicket.findMany({
    where: { isDraft: false },
    select: { id: true, summary: true, status: true },
    take: 3,
  });
  const transitions: [TicketStatus, TicketStatus][] = [
    [TicketStatus.IN_PROGRESS, TicketStatus.DONE],
    [TicketStatus.TO_DO, TicketStatus.IN_PROGRESS],
    [TicketStatus.IN_PROGRESS, TicketStatus.REQUIRES_APPROVAL],
  ];
  for (const [index, ticket] of tickets.entries()) {
    const [from, to] = transitions[index % transitions.length];
    await prisma.ticketActivity.create({
      data: {
        ticketId: ticket.id,
        userId: user.id,
        type: TicketActivityType.STATUS_CHANGED,
        data: { from, to, seedTag: TAG },
        createdAt: hoursAgo(index + 1),
      },
    });
    console.log(
      `  ✅ status change    ${from} → ${to}  ${ticket.summary.slice(0, 40)}`,
    );
  }

  // New assets, two models, so the card can collapse them into "N× model".
  const groups = await prisma.deviceGroup.findMany({
    where: { manufacturerId: { not: null } },
    select: {
      id: true,
      manufacturer: { select: { canonicalDisplayName: true } },
      product: { select: { canonicalDisplayName: true } },
    },
    take: 2,
  });
  const integration = await prisma.integration.findFirst({
    select: { id: true },
  });
  const perGroup = [3, 2];
  for (const [groupIndex, group] of groups.entries()) {
    for (let i = 0; i < perGroup[groupIndex]; i++) {
      await prisma.asset.create({
        data: {
          ip: `10.90.${groupIndex}.${i + 10}`,
          hostname: `${TAG} seeded-${groupIndex}-${i}`,
          deviceGroupId: group.id,
          userId: user.id,
          createdAt: hoursAgo(groupIndex + 1),
          ...(integration
            ? {
                externalMappings: {
                  create: {
                    integrationId: integration.id,
                    externalId: `${TAG}-${groupIndex}-${i}`,
                    upstreamApi: "seed"
                  },
                },
              }
            : {}),
        },
      });
    }
    console.log(
      `  ✅ ${perGroup[groupIndex]}× asset      ${group.manufacturer?.canonicalDisplayName} ${group.product?.canonicalDisplayName ?? ""}`.trimEnd(),
    );
  }

  console.log(
    `\n✨ Seeded. Expect the card to show 2 advisories, 1 recall, ${tickets.length} work orders, 5 new assets.` +
      "\n   Two seeded notifications must NOT appear: the Acme advisory (no assets in inventory)" +
      "\n   and the firmware update (UpdateAvailable has no chip).",
  );
}

const args = process.argv.slice(2);
const unknown = args.filter((arg) => arg !== "--clean");
if (unknown.length > 0) {
  console.error(
    `Unknown argument(s): ${unknown.join(", ")}\n` +
      "Usage: npx tsx scripts/seed-recent-changes.ts [--clean]",
  );
  process.exit(1);
}

const run = args.includes("--clean") ? clean : seed;
Promise.resolve()
  .then(assertLocalDatabase)
  .then(run)
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
