// Dev harness: drive the work-order ingestion agents on inline email content
// (no Resend / webhook needed). Mirrors the work-order branch of
// src/inngest/functions/process-inbox-email.ts so we can try sample emails fast.
//
//   npx tsx scripts/run-work-order-email.ts
//
import { searchCandidates } from "@/features/inbox/agent/candidate-search";
import { classifyEmailKind } from "@/features/inbox/agent/classify-kind";
import { extractEntities } from "@/features/inbox/agent/extract";
import { extractWorkOrder } from "@/features/inbox/agent/extract-work-order";
import { matchAndLinkEntities } from "@/features/inbox/agent/match";
import { getAutomationUser } from "@/lib/automation-user";
import prisma from "@/lib/db";

const SAMPLE = {
  from: "service@nexusnetworks.example.com",
  subject: "Work Order NX-8810 — Cisco ASA 5505 firewall upgrade + ACL change",
  markdown: `Hello,

This is a scheduled service work order from Nexus Network Services. We need IT to coordinate an upgrade of the perimeter Cisco ASA 5505 firewall and apply an updated ACL set.

- Action required: Upgrade the Cisco ASA 5505 to Adaptive Security Appliance Software 9.1(7), then push the revised inbound ACLs for the clinical VLAN.
- Affected device: Cisco ASA 5505 (perimeter firewall).
- Coordination: please have Biomed confirm the device-VLAN segmentation for connected medical equipment before the cutover.
- Requested completion date: August 5, 2026.
- Vendor engineer (assignee): Marcus Lee, Nexus Network Services (marcus.lee@nexusnetworks.example.com).

Expect ~20 minutes of firewall downtime; schedule during an overnight maintenance window. Please confirm the window.

Regards,
Nexus Network Services`,
};

function parseScheduledAt(value: string | null): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

async function main() {
  const email = SAMPLE;

  // Stand in for the save-source step.
  const source = await prisma.notificationSource.create({
    data: {
      channel: "Email",
      externalId: `dev-test-${crypto.randomUUID()}`,
      raw: {},
      markdown: email.markdown,
    },
  });
  const sourceId = source.id;

  const { kind, reasonWhy } = await classifyEmailKind(sourceId, email);
  console.log(`kind: ${kind}  (${reasonWhy})`);
  if (kind !== "work_order") {
    console.log("Not a work order — stopping.");
    await prisma.$disconnect();
    return;
  }

  const wo = await extractWorkOrder(sourceId, email);

  const automation = await getAutomationUser();
  const wanted = new Set(wo.departmentNames.map((n) => n.trim().toLowerCase()));
  const departmentIds = wanted.size
    ? (await prisma.department.findMany({ select: { id: true, name: true } }))
        .filter((d) => wanted.has(d.name.toLowerCase()))
        .map((d) => d.id)
    : [];

  const ticket = await prisma.workOrderTicket.create({
    data: {
      summary: wo.summary,
      body: email.markdown,
      category: wo.category,
      scheduledAt: parseScheduledAt(wo.scheduledAt),
      suggestedAssignee: wo.suggestedAssignee,
      sourceLabel: email.from,
      creatorId: automation.id,
      departments: { connect: departmentIds.map((id) => ({ id })) },
      sources: { connect: { id: sourceId } },
    },
  });

  const extracted = await extractEntities(sourceId, email);
  let linkSummary = { linked: 0, updated: 0, created: 0, skipped: 0 };
  if (!Object.values(extracted).every((v) => v.length === 0)) {
    const candidates = await searchCandidates(extracted);
    linkSummary = await matchAndLinkEntities(
      { workOrderTicketId: ticket.id },
      extracted,
      candidates,
    );
  }

  const full = await prisma.workOrderTicket.findUniqueOrThrow({
    where: { id: ticket.id },
    select: {
      summary: true,
      category: true,
      scheduledAt: true,
      suggestedAssignee: true,
      sourceLabel: true,
      departments: { select: { name: true } },
      sources: { select: { channel: true } },
      deviceGroups: {
        select: {
          confidence: true,
          deviceGroupMatching: {
            select: {
              vendor: { select: { canonicalDisplayName: true } },
              product: { select: { canonicalDisplayName: true } },
            },
          },
        },
      },
    },
  });

  console.log("\n── Work order created ──────────────────────");
  console.log("summary:    ", full.summary);
  console.log(
    "category:   ",
    full.category,
    "| scheduledAt:",
    full.scheduledAt?.toISOString().slice(0, 10) ?? "—",
  );
  console.log("assignee:   ", full.suggestedAssignee ?? "—");
  console.log(
    "source:     ",
    full.sources.map((s) => s.channel).join(",") || "—",
    "| label:",
    full.sourceLabel,
  );
  console.log(
    "departments:",
    full.departments.map((d) => d.name).join(", ") || "—",
  );
  console.log(
    "deviceGroups:",
    full.deviceGroups
      .map(
        (d) =>
          `${d.deviceGroupMatching.vendor?.canonicalDisplayName ?? "?"} ${d.deviceGroupMatching.product?.canonicalDisplayName ?? ""} [${d.confidence}]`,
      )
      .join(" | ") || "—",
  );
  console.log("linkSummary:", JSON.stringify(linkSummary));

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
