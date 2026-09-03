// Standalone seed: one notification with two mitigation plans (recommended +
// alternative), each with draft work orders — enough to open the accept-plan
// drawer / work order detail and exercise the real briefing agent (getBriefing
// makes a real LLM call on first open, per plan).
//
// Usage: npx tsx scripts/seed-briefing-example.ts
import { NotificationType, Priority, Tlp } from "@/generated/prisma";
import prisma from "../src/lib/db";

const SEED_USER_EMAIL = "user@example.com";
// Suffixed with a run id so each invocation creates a fresh, ungenerated
// briefing to test against instead of hitting the previous run's cache.
const TITLE = `Infusion pump firmware RCE — unauthenticated command injection (CVE-2025-90210) [${Date.now().toString(36)}]`;

async function main() {
  const user = await prisma.user.findUniqueOrThrow({
    where: { email: SEED_USER_EMAIL },
  });

  const notification = await prisma.notification.create({
    data: {
      title: TITLE,
      summary:
        "6 infusion pumps on the clinical VLAN accept unauthenticated firmware commands over their maintenance port. A public PoC exists; the vendor confirms exploitation in the wild.",
      type: NotificationType.Advisory,
      priority: Priority.Critical,
      tlp: Tlp.WHITE,
      hospitalImpact: {
        byline:
          "Unauthenticated RCE on infusion pumps could let an attacker alter dosing.",
        impactStatement:
          "All 6 pumps in the med-surg wing accept unsigned firmware pushes over the maintenance port. An attacker on the clinical VLAN could push malicious firmware and alter dosing behavior.",
        careAreas: "Med-Surg — infusion pumps",
        likelihood:
          "Public PoC available · vendor confirms active exploitation",
      },
      priorityReasonWhy:
        "Unauthenticated RCE with active exploitation on devices that directly affect patient dosing.",
    },
  });

  const recommended = await prisma.mitigationPlan.create({
    data: {
      notificationId: notification.id,
      order: 0,
      isAccepted: false,
      title: "Patch all 6 pumps tonight",
      summary:
        "Apply the vendor's signed firmware update to all 6 affected pumps during tonight's low-census window, closing the vulnerability in one pass.",
      compareLine:
        "Closes the vulnerability outright tonight, vs. segmentation which only contains it.",
      cards: {
        effort: "2 tickets · ~6 hrs total",
        downtime: "~20 min per pump, staggered",
        residual_risk: "None",
        coverage: "6 of 6 assets",
        timeline: "Closed tonight",
        rollback_level: "Moderate",
        rollback_summary: "revert to prior firmware image, ~15 min per pump",
      },
      workOrders: {
        create: [
          {
            summary: "Apply signed firmware update to med-surg infusion pumps",
            body: "Push vendor firmware v4.2.1 to all 6 pumps (MEDSURG-PUMP-01..06) during the 02:00–04:00 low-census window. Verify signature before flashing; confirm dosing self-test passes on each pump post-update.",
            sourceLabel: "Vendor advisory",
            suggestedAssignee: "Biomed Engineering",
            isDraft: true,
            notificationId: notification.id,
            creatorId: user.id,
          },
        ],
      },
    },
  });

  await prisma.mitigationPlan.create({
    data: {
      notificationId: notification.id,
      order: 1,
      isAccepted: false,
      title: "Segment pumps onto an isolated VLAN now, patch next window",
      summary:
        "Move the 6 affected pumps to an isolated VLAN with no maintenance-port access from general clinical traffic, buying time to patch during a scheduled maintenance window instead of tonight.",
      compareLine:
        "No patch downtime tonight, but leaves the vulnerability unpatched until the next window.",
      cards: {
        effort: "1 ticket · ~2 hrs total",
        downtime: "None",
        residual_risk: "Low",
        residual_risk_note:
          "Firmware stays vulnerable until the next maintenance window; segmentation blocks the only reachable exploit path.",
        coverage: "6 of 6 assets",
        timeline: "Contained today, closed next maintenance window",
        rollback_level: "Easy",
        rollback_summary: "revert VLAN assignment from the switch, ~15 min",
      },
      workOrders: {
        create: [
          {
            summary: "Move med-surg infusion pumps to isolated VLAN 220",
            body: "Reassign switch ports for MEDSURG-PUMP-01..06 to VLAN 220, which has no route to the general clinical VLAN's maintenance-port range. Confirm pumps retain EMR connectivity after the move.",
            sourceLabel: "Internal mitigation",
            suggestedAssignee: "Network Engineering",
            isDraft: true,
            notificationId: notification.id,
            creatorId: user.id,
          },
        ],
      },
    },
  });

  console.log(`✅ Created: ${TITLE}`);
  console.log(`   Notification: ${notification.id}`);
  console.log(`   Recommended plan: ${recommended.id}`);
  console.log(
    "   Open the notification, accept-plan drawer → Briefing tab to trigger the agent.",
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
