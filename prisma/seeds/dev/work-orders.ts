import { assetNameSelect, getAssetDisplayName } from "@/features/assets/utils";
import {
  SourceChannel,
  TicketCategory,
  TicketStatus,
} from "@/generated/prisma";
import prisma from "@/lib/db";
import { sourceContentHash } from "@/lib/source-hash";

type SampleTicket = {
  summary: string;
  // Default body, applied to the primary department when no per-department
  // override exists in `descriptionsByDepartment`.
  description?: string;
  // Per-department description bodies, keyed by department name. Overrides
  // `description` for any matching department; departments that appear here
  // but not in `department`/`departments` are ignored.
  descriptionsByDepartment?: Record<string, string>;
  status: TicketStatus;
  category: TicketCategory;
  // Single primary department or an ordered list — first entry is "primary"
  // for the purpose of the default `description` fallback.
  department: string | string[];
  // When set, the seed creates a linked NotificationSource on this channel
  // (the ticket renders as ingested). Omitted ⇒ manually created.
  sourceChannel?: SourceChannel;
  sourceLabel?: string;
  scheduledAt?: Date;
  linkedCveIds?: string[];
  linkedAssetIds?: string[];
  comments?: string[];
  // When true, the seed user's "last seen" is stamped *before* the comment
  // activity, so the ticket renders with the unread-comments indicator. When
  // false/omitted (and the ticket has comments) it's stamped *after*, i.e.
  // already read. Tickets without comments never show the indicator.
  commentsUnread?: boolean;
};

type SampleParentTicket = SampleTicket & { children?: SampleTicket[] };

// Tickets generated against the seed vulnerabilities, assets and workflows.
// Scheduled dates are relative to seed run; relative offsets are computed below.
const dayMs = 24 * 60 * 60 * 1000;

const now = Date.now();

const inDays = (n: number) => new Date(now + n * dayMs);

const SAMPLE_CHANGE_TICKETS: SampleParentTicket[] = [
  {
    summary: "Update Baxter Infusion Pumps Firmware",
    status: TicketStatus.IN_PROGRESS,
    category: TicketCategory.FIRMWARE_UPDATE,
    department: ["Biomed", "Nursing"],
    descriptionsByDepartment: {
      Biomed:
        "Baxter Sigma Spectrum infusion pumps are running firmware version 1.2.3, which is vulnerable to CVE-2021-12345 (hypothetical buffer overflow). Update all 23 pumps to firmware 1.4.0 from the Baxter support portal. Validate dose-error reduction software (DERS) library integrity and channel-to-channel concentration calculations on each pump post-update before returning to clinical use.",
      Nursing:
        "Infusion pumps in your unit will be pulled for firmware updates in rolling batches of ~4 pumps at a time, by floor. Biomed will deliver swap pumps before pulling each batch — no expected interruption to active infusions, but please verify any in-progress drips are re-programmed on the swap pump and document the channel hand-off in the MAR. Escalate to charge nurse if Biomed can't supply a swap before pulling a pump.",
    },
    linkedCveIds: ["CVE-2021-12345"],
    linkedAssetIds: Array.from(
      { length: 23 },
      (_, i) => `rad-pump-${String(i + 1).padStart(3, "0")}`,
    ),
    comments: ["Firmware update available from Baxter support portal."],
    commentsUnread: true,
    children: [
      {
        summary: "Update firmware on ICU pumps (4 devices)",
        description:
          "Schedule update for pumps in ICU first, coordinate with nursing to minimize disruption.",
        status: TicketStatus.DONE,
        category: TicketCategory.FIRMWARE_UPDATE,
        department: "Biomed",
        linkedCveIds: ["CVE-2021-12345"],
        linkedAssetIds: [
          "rad-pump-001",
          "rad-pump-002",
          "rad-pump-003",
          "rad-pump-004",
        ],
        comments: [
          "Completed on 2026-05-15; validated pump functionality post-update.",
        ],
      },
      {
        summary: "Update firmware on ER pumps (3 devices)",
        description:
          "Schedule update for pumps in ER next, coordinate with nursing to minimize disruption.",
        status: TicketStatus.IN_PROGRESS,
        category: TicketCategory.FIRMWARE_UPDATE,
        department: "Biomed",
        linkedCveIds: ["CVE-2021-12345"],
        linkedAssetIds: ["rad-pump-005", "rad-pump-006", "rad-pump-007"],
        comments: ["Pending Biomed review and scheduling."],
        commentsUnread: true,
      },
      {
        summary: "Update firmware on Surgery pumps (3 devices)",
        description:
          "Schedule update for pumps in Surgery next, coordinate with nursing to minimize disruption.",
        status: TicketStatus.TO_DO,
        category: TicketCategory.FIRMWARE_UPDATE,
        department: "Biomed",
        linkedCveIds: ["CVE-2021-12345"],
        linkedAssetIds: ["rad-pump-008", "rad-pump-009", "rad-pump-010"],
      },
    ],
  },
  {
    summary:
      "Remediate EternalBlue (CVE-2017-0144) across EOL Windows imaging hosts",
    status: TicketStatus.IN_PROGRESS,
    category: TicketCategory.VULN_REMEDIATION,
    department: ["Radiology", "IT", "Administration"],
    descriptionsByDepartment: {
      Radiology:
        "Five hosts in the imaging chain — the CT acquisition workstation, the PACS server, two diagnostic reading workstations, and the ED bedside viewer — are EOL Windows 7 / Server 2008 R2 and vulnerable to MS17-010. Each will be touched on its own schedule to keep at least one diagnostic workstation online at all times. Expect a brief read interruption (under 5 minutes) per workstation; PACS work will run in a dedicated overnight maintenance window with CMO sign-off.",
      IT: "SMBv1 disablement on each host (registry + reboot), plus network-level compensating controls: ACL blocking TCP/445 across the imaging and PACS VLANs, and a DICOM-only VLAN ACL to limit blast radius. ASA configs were backed up before any change. Track per-host workstreams in the child tickets; the network-level controls are already deployed and verified by packet capture.",
      Administration:
        "Imaging-chain EternalBlue remediation. Compliance-relevant: EOL OS exposure on patient-facing systems. PACS server change requires CMO sign-off (separate child ticket) due to imaging chain blast radius. Expected aggregate downtime across all hosts: under 30 minutes during business hours, plus a single overnight maintenance window for PACS.",
    },
    sourceChannel: SourceChannel.Integration,
    sourceLabel: "TriMedX RSQ",
    linkedCveIds: ["CVE-2017-0144"],
    linkedAssetIds: [
      "rad-ws-001",
      "rad-pacs-001",
      "rad-rws-001",
      "rad-rws-002",
      "rad-ed-001",
    ],
    comments: [
      "Tracking five hosts + two compensating controls. Final verify lands once PACS patch is approved.",
    ],
    children: [
      {
        summary: "Disable SMBv1 on CT Acquisition Workstation (rad-ws-001)",
        description:
          "Mitigates EternalBlue on the EOL Windows 7 host. Coordinate with Radiology — workstation is on the Emergency CT path.",
        status: TicketStatus.TO_DO,
        category: TicketCategory.CONFIG_CHANGE,
        department: "Radiology",
        sourceChannel: SourceChannel.Integration,
        sourceLabel: "TriMedX RSQ",
        linkedCveIds: ["CVE-2017-0144"],
        linkedAssetIds: ["rad-ws-001"],
        comments: [
          "Life-safety path: confirm fallback procedure before rollout.",
          "Manufacturer compat check pending with GE for Advantage Workstation 4.6.",
        ],
      },
      {
        summary: "Patch PACS Server EternalBlue (rad-pacs-001)",
        description:
          "PACS server is on EOL Windows Server 2008 R2. Apply MS17-010 via extended support or disable SMBv1 + block 445 at the switch. Affects the entire imaging workflow.",
        status: TicketStatus.REQUIRES_APPROVAL,
        category: TicketCategory.VULN_REMEDIATION,
        department: "Radiology",
        sourceChannel: SourceChannel.Email,
        sourceLabel: "security@hospital.example.org",
        scheduledAt: inDays(10),
        linkedCveIds: ["CVE-2017-0144"],
        linkedAssetIds: ["rad-pacs-001"],
        comments: [
          "Awaiting CMO sign-off — full imaging chain outage if this goes sideways.",
        ],
      },
      {
        summary: "Disable SMBv1 on Radiology Diagnostic Workstations",
        description:
          "Apply SMBv1 disablement to rad-rws-001 and rad-rws-002 in tandem so radiologist coverage isn't interrupted.",
        status: TicketStatus.IN_PROGRESS,
        category: TicketCategory.CONFIG_CHANGE,
        department: "Radiology",
        scheduledAt: inDays(1),
        linkedCveIds: ["CVE-2017-0144"],
        linkedAssetIds: ["rad-rws-001", "rad-rws-002"],
        comments: ["rws-001 done; rws-002 scheduled for tonight."],
      },
      {
        summary: "Block TCP/445 at imaging switch (rad-sw-001)",
        status: TicketStatus.DONE,
        category: TicketCategory.CONFIG_CHANGE,
        department: ["IT", "Radiology"],
        descriptionsByDepartment: {
          IT: "Network-level compensating control for EternalBlue on EOL Windows hosts. ACL deployed on imaging and PACS VLANs blocking inbound TCP/445 except from the management VLAN. Verified by packet capture post-deployment.",
          Radiology:
            "Networking change on the imaging switch shouldn't be visible from any reading workstation — DICOM traffic (104/TCP) is unaffected. If you see new failures sending studies to PACS or pulling priors, flag IT immediately; we ran post-deploy validation but want eyes on it for the first 48 hours.",
        },
        scheduledAt: inDays(-9),
        linkedCveIds: ["CVE-2017-0144"],
        linkedAssetIds: ["rad-sw-001"],
        comments: ["Work order ticket CHG-2207 closed; pending verification."],
      },
      {
        summary: "Verify DICOM VLAN ACL enforcement",
        description:
          "Validate post-deployment that only DICOM (104/TCP) is permitted between imaging devices and PACS.",
        status: TicketStatus.DONE,
        category: TicketCategory.CONFIG_CHANGE,
        department: "IT",
        scheduledAt: inDays(-6),
        linkedCveIds: ["CVE-2020-25175"],
        linkedAssetIds: ["rad-pacs-001", "rad-sw-001"],
        comments: ["Validated via packet capture on 2026-05-21."],
      },
    ],
  },
  {
    summary: "GE Imaging Device Hardening (CVE-2020-25175)",
    commentsUnread: true,
    description:
      "Umbrella ticket for credential-exposure mitigations across GE BrightSpeed CT, LOGIQ e ultrasounds, and Optima XR200amx per CISA ICSMA-20-343-01.",
    status: TicketStatus.TO_DO,
    category: TicketCategory.VULN_REMEDIATION,
    department: "Radiology",
    sourceChannel: SourceChannel.Integration,
    sourceLabel: "TriMedX RSQ",
    linkedCveIds: ["CVE-2020-25175"],
    linkedAssetIds: ["rad-ct-001", "rad-us-001", "rad-us-002", "rad-xr-001"],
    comments: [
      "Proposed by workflow after AI.PatchRead flagged credential exposure on the DICOM VLAN.",
    ],
    children: [
      {
        summary: "Isolate GE imaging devices to a dedicated DICOM VLAN",
        description:
          "Per CISA ICSMA-20-343-01, isolate the BrightSpeed CT, both LOGIQ e ultrasounds, and the Optima XR200amx onto a DICOM-only VLAN with strict ACLs. Coordinate with Biomed for post-change DICOM validation.",
        status: TicketStatus.TO_DO,
        category: TicketCategory.CONFIG_CHANGE,
        department: "Radiology",
        sourceChannel: SourceChannel.Integration,
        sourceLabel: "TriMedX RSQ",
        linkedCveIds: ["CVE-2020-25175"],
        linkedAssetIds: [
          "rad-ct-001",
          "rad-us-001",
          "rad-us-002",
          "rad-xr-001",
        ],
      },
    ],
  },
  {
    summary: "Cisco ASA EXTRABACON Upgrades (CVE-2016-6366)",
    status: TicketStatus.REQUIRES_APPROVAL,
    category: TicketCategory.PATCH,
    department: ["IT", "Administration"],
    descriptionsByDepartment: {
      IT: "Upgrade both ASA 5505 appliances (perimeter firewall + remote radiology VPN gateway) from 8.2 to a patched 9.1(7.21) release. Separate maintenance windows: perimeter firewall first (~30 min downtime, business-impact: external traffic suspended), then VPN gateway (coordinate with remote radiology — after-hours read coverage gap). Pre-stage backup configs; test rollback procedure in a change window before production. If immediate upgrade can't be scheduled, switch SNMPv2c → SNMPv3 with auth+encryption or restrict community access via ACL to the management VLAN.",
      Administration:
        "EXTRABACON remote-code-execution exposure on perimeter firewall. Patient impact: minimal during business hours (~30 min internet outage); after-hours remote radiology read coverage may be briefly interrupted during VPN upgrade. Recommend approving the staggered upgrade plan from IT. Risk if deferred: known SNMP RCE exploit chain against an internet-facing device.",
    },
    linkedCveIds: ["CVE-2016-6366"],
    linkedAssetIds: ["rad-fw-001", "rad-vpn-001"],
    children: [
      {
        summary: "Upgrade Perimeter Firewall ASA 8.2 → 9.1(7.21)",
        description:
          "SNMP RCE on ASA 8.x. Upgrade rad-fw-001 to a patched 9.1.x release in a maintenance window.",
        status: TicketStatus.REQUIRES_APPROVAL,
        category: TicketCategory.PATCH,
        department: "IT",
        scheduledAt: inDays(7),
        linkedCveIds: ["CVE-2016-6366"],
        linkedAssetIds: ["rad-fw-001"],
        comments: ["~30 min downtime expected; backup config staged."],
      },
      {
        summary: "Upgrade Cisco ASA VPN gateway (rad-vpn-001)",
        description:
          "Coordinate with remote radiology coverage. Upgrade ASA 8.2 → 9.1.x to remediate EXTRABACON.",
        status: TicketStatus.IN_PROGRESS,
        category: TicketCategory.PATCH,
        department: "IT",
        sourceChannel: SourceChannel.Email,
        sourceLabel: "security@hospital.example.org",
        scheduledAt: inDays(3),
        linkedCveIds: ["CVE-2016-6366"],
        linkedAssetIds: ["rad-vpn-001"],
      },
    ],
  },
  {
    summary: "Patient Device Roadmap",
    description:
      "Tracks longer-horizon decisions for patient monitor and infusion pump fleets — manufacturer engagement, fleet refresh planning.",
    status: TicketStatus.TO_DO,
    category: TicketCategory.OTHER,
    department: "Biomed",
    children: [
      {
        summary: "Investigate IntelliVue MP5 firmware update availability",
        description:
          "Open ticket with Philips on patient monitor firmware roadmap and known vulns.",
        status: TicketStatus.TO_DO,
        category: TicketCategory.OTHER,
        department: "Biomed",
        linkedAssetIds: Array.from(
          { length: 13 },
          (_, i) => `rad-mon-${String(i + 1).padStart(3, "0")}`,
        ),
      },
      {
        summary: "Replace Baxter Sigma Spectrum infusion pumps",
        description:
          "Proposed full fleet replacement deferred — out-of-budget this FY. Revisit in next capital cycle.",
        status: TicketStatus.DONE,
        category: TicketCategory.OTHER,
        department: "Biomed",
        linkedAssetIds: Array.from(
          { length: 23 },
          (_, i) => `rad-pump-${String(i + 1).padStart(3, "0")}`,
        ),
        comments: ["Deferred per Admin — revisit FY27 capital plan."],
      },
    ],
  },
  // ── Neighbouring work on the two Cisco ASA appliances ──────────────────
  // Standalone tickets from several departments that touch rad-fw-001 and
  // rad-vpn-001. Populates the "Other active work orders on these assets"
  // card on the EXTRABACON ticket: the firewall group exceeds the five-row
  // cap ("Show 3 more"), the VPN gateway group exceeds it by one, and the
  // Done ticket at the end must not appear.
  {
    summary: "Restrict SNMP on the perimeter firewall to the management VLAN",
    description:
      "Interim control until the ASA upgrade lands: ACL the SNMP community to the management VLAN only.",
    status: TicketStatus.IN_PROGRESS,
    category: TicketCategory.NETWORK_REMEDIATION,
    department: "IT",
    scheduledAt: inDays(1),
    linkedAssetIds: ["rad-fw-001", "rad-vpn-001"],
  },
  {
    summary: "Quarterly firewall rule review — perimeter",
    description: "Review and prune stale inbound rules on rad-fw-001.",
    status: TicketStatus.TO_DO,
    category: TicketCategory.CONFIG_CHANGE,
    department: "IT",
    scheduledAt: inDays(2),
    linkedAssetIds: ["rad-fw-001"],
  },
  {
    summary: "Rotate the VPN gateway TLS certificate",
    description: "Current certificate expires in 30 days.",
    status: TicketStatus.TO_DO,
    category: TicketCategory.CONFIG_CHANGE,
    department: "IT",
    scheduledAt: inDays(5),
    linkedAssetIds: ["rad-vpn-001"],
  },
  {
    summary: "Enable SNMPv3 with auth and encryption on both ASA appliances",
    description:
      "Replace the SNMPv2c community string once the upgrade completes.",
    status: TicketStatus.TO_DO,
    category: TicketCategory.CONFIG_CHANGE,
    department: "IT",
    scheduledAt: inDays(4),
    linkedAssetIds: ["rad-fw-001", "rad-vpn-001"],
  },
  {
    summary: "Verify remote radiology VPN failover after the ASA upgrade",
    description:
      "Confirm after-hours read coverage reconnects within the SLA once rad-vpn-001 is back.",
    status: TicketStatus.REQUIRES_APPROVAL,
    category: TicketCategory.CLINICAL_REVIEW,
    department: "Radiology",
    scheduledAt: inDays(8),
    linkedAssetIds: ["rad-fw-001", "rad-vpn-001"],
  },
  {
    summary:
      "Confirm ED telemetry traffic survives the firewall maintenance window",
    description:
      "Telemetry alarms route through the perimeter to the paging vendor. Validate the failover path.",
    status: TicketStatus.TO_DO,
    category: TicketCategory.CLINICAL_REVIEW,
    department: "Emergency Department",
    scheduledAt: inDays(6),
    linkedAssetIds: ["rad-fw-001"],
  },
  {
    summary: "Change-window sign-off — perimeter firewall maintenance",
    description:
      "Approve the 30-minute external outage and notify affected departments.",
    status: TicketStatus.TO_DO,
    category: TicketCategory.OTHER,
    department: "Administration",
    scheduledAt: inDays(6),
    linkedAssetIds: ["rad-fw-001"],
  },
  {
    summary: "Procure ASA 5506-X replacements for the end-of-life 5505s",
    description:
      "Both 5505 appliances are past end-of-support. Quote replacements for the next capital cycle.",
    status: TicketStatus.TO_DO,
    category: TicketCategory.NEW_ASSET_PROCUREMENT,
    department: "Procurement",
    linkedAssetIds: ["rad-fw-001", "rad-vpn-001"],
  },
  {
    summary: "Validate SNMP trap forwarding to the SIEM after the upgrade",
    description:
      "Traps from both appliances must still reach the SIEM collector on the new release.",
    status: TicketStatus.TO_DO,
    category: TicketCategory.CONFIG_CHANGE,
    department: "IT",
    scheduledAt: inDays(9),
    linkedAssetIds: ["rad-fw-001", "rad-vpn-001"],
  },
  {
    summary: "Archive the legacy ASA 8.2 configurations",
    description: "Configs exported to the change-management share.",
    status: TicketStatus.DONE,
    category: TicketCategory.OTHER,
    department: "IT",
    linkedAssetIds: ["rad-fw-001", "rad-vpn-001"],
  },
];

// Related-ticket links between seeded tickets, resolved by summary after
// creation because ticket ids are cuids. Mirrors linkTicket() in
// src/features/tracking/server/routers.ts.
const SAMPLE_RELATED_TICKET_LINKS: { a: string; b: string; reason: string }[] =
  [
    {
      a: "Block TCP/445 at imaging switch (rad-sw-001)",
      b: "Patch PACS Server EternalBlue (rad-pacs-001)",
      reason:
        "Switch ACL is the compensating control for the same EternalBlue exposure until the PACS patch is approved.",
    },
    {
      a: "Verify DICOM VLAN ACL enforcement",
      b: "Isolate GE imaging devices to a dedicated DICOM VLAN",
      reason:
        "Both change the DICOM VLAN ACLs; re-run the verification once the GE devices are moved.",
    },
  ];

// Fixed timestamps so the seeded unread-comments indicator is deterministic:
// commented tickets get `lastCommentAt = COMMENTED_AT`, and the seed user's
// `seenAt` lands before (unread) or after (read) that moment.
const COMMENTED_AT = new Date("2026-06-20T12:00:00Z");

const SEEN_BEFORE_COMMENT = new Date("2026-06-19T09:00:00Z");

const SEEN_AFTER_COMMENT = new Date("2026-06-21T09:00:00Z");

// Mirrors createAssetTicket() in src/features/tracking/server/asset-tickets.ts
// (not imported directly — that module is 'server-only', which this
// standalone seed script isn't). Keep in sync if that shape changes.
async function seedAssetTicket(
  parentTicket: {
    id: string;
    summary: string;
    category: TicketCategory;
    sourceLabel: string | null;
    scheduledAt: Date | null;
  },
  assetId: string,
  userId: string,
) {
  const asset = await prisma.asset.findUniqueOrThrow({
    where: { id: assetId },
    select: assetNameSelect,
  });
  await prisma.workOrderTicket.create({
    data: {
      summary: `${parentTicket.summary} — ${getAssetDisplayName(asset)}`,
      category: parentTicket.category,
      sourceLabel: parentTicket.sourceLabel,
      scheduledAt: parentTicket.scheduledAt,
      creatorId: userId,
      parentId: parentTicket.id,
      ticket: { create: { assetId, parentTicketId: parentTicket.id } },
    },
  });
  await prisma.ticketActivity.create({
    data: {
      ticketId: parentTicket.id,
      userId,
      type: "ASSET_ATTACHED",
      data: { assetId, assetLabel: getAssetDisplayName(asset) },
    },
  });
}

async function createWorkOrderTicket(
  ticket: SampleTicket,
  userId: string,
  parentId: string | null,
) {
  // Normalize single-dept and multi-dept shapes to one ordered list. The
  // first entry is the "primary" department, used as the fallback target
  // for the default `description` field.
  const departmentNames = Array.isArray(ticket.department)
    ? ticket.department
    : [ticket.department];
  const departments = await prisma.department.findMany({
    where: { name: { in: departmentNames } },
  });
  // Preserve the seed-declared order.
  const departmentsByName = new Map(departments.map((d) => [d.name, d]));
  const orderedDepartments = departmentNames
    .map((n) => departmentsByName.get(n))
    .filter((d): d is (typeof departments)[number] => Boolean(d));

  const linkedVulns = ticket.linkedCveIds?.length
    ? await prisma.vulnerability.findMany({
        where: { cveId: { in: ticket.linkedCveIds } },
        select: { id: true },
      })
    : [];

  const linkedAssets = ticket.linkedAssetIds?.length
    ? await prisma.asset.findMany({
        where: { id: { in: ticket.linkedAssetIds } },
        select: { id: true },
      })
    : [];

  const linkedRemediations = ticket.linkedCveIds?.length
    ? await prisma.remediation.findMany({
        where: {
          vulnerabilities: { some: { cveId: { in: ticket.linkedCveIds } } },
        },
        select: { id: true },
      })
    : [];

  const linkedIssues =
    ticket.linkedAssetIds?.length && ticket.linkedCveIds?.length
      ? await prisma.issue.findMany({
          where: {
            assetId: { in: ticket.linkedAssetIds },
            vulnerability: { cveId: { in: ticket.linkedCveIds } },
          },
          select: { id: true },
        })
      : [];

  // Build one description row per linked department. Each department gets
  // its per-department override from `descriptionsByDepartment` if present;
  // the primary department additionally falls back to the default
  // `description` field. Departments without any body produce no row.
  const seededDescriptions = orderedDepartments
    .map((d, idx) => {
      const override = ticket.descriptionsByDepartment?.[d.name];
      const body = override ?? (idx === 0 ? ticket.description : undefined);
      if (!body) return null;
      return { body, departmentId: d.id };
    })
    .filter((d): d is { body: string; departmentId: string } => d !== null);

  const created = await prisma.workOrderTicket.create({
    data: {
      summary: ticket.summary,
      status: ticket.status,
      category: ticket.category,
      sourceLabel: ticket.sourceLabel,
      // For ingested demo tickets, attach a SourceRecord on the given channel
      // so the Source column renders the channel icon + label.
      sourceLinks: ticket.sourceChannel
        ? {
            create: [
              {
                sourceRecord: {
                  create: {
                    channel: ticket.sourceChannel,
                    raw: {},
                    contentHash: sourceContentHash({}, null),
                  },
                },
              },
            ],
          }
        : undefined,
      departments: {
        connect: orderedDepartments.map((d) => ({ id: d.id })),
      },
      descriptions: seededDescriptions.length
        ? { create: seededDescriptions }
        : undefined,
      parentId,
      creatorId: userId,
      assigneeId: userId,
      // Creator + assignee auto-watch (both are `userId` here, so one row).
      watchers: { create: [{ userId }] },
      // Stamp lastCommentAt for commented tickets, and the user's last-seen
      // before/after it to drive a realistic read/unread mix.
      lastCommentAt: ticket.comments?.length ? COMMENTED_AT : null,
      seenBy: {
        create: [
          {
            userId,
            seenAt:
              ticket.comments?.length && ticket.commentsUnread
                ? SEEN_BEFORE_COMMENT
                : SEEN_AFTER_COMMENT,
          },
        ],
      },
      scheduledAt: ticket.scheduledAt,
      vulnerabilities: { connect: linkedVulns.map((v) => ({ id: v.id })) },
      remediations: {
        connect: linkedRemediations.map((r) => ({ id: r.id })),
      },
      issues: { connect: linkedIssues.map((i) => ({ id: i.id })) },
      comments: ticket.comments?.length
        ? {
            create: ticket.comments.map((body) => ({
              body,
              authorId: userId,
            })),
          }
        : undefined,
    },
  });

  for (const asset of linkedAssets) {
    await seedAssetTicket(created, asset.id, userId);
  }

  return created;
}

export async function seedWorkOrderTickets(userId: string) {
  console.log("\n🌱 Seeding work order tickets...");

  let parentCount = 0;
  let childCount = 0;
  const idBySummary = new Map<string, string>();

  for (const parent of SAMPLE_CHANGE_TICKETS) {
    const created = await createWorkOrderTicket(parent, userId, null);
    idBySummary.set(created.summary, created.id);
    parentCount++;
    for (const child of parent.children ?? []) {
      const createdChild = await createWorkOrderTicket(
        child,
        userId,
        created.id,
      );
      idBySummary.set(createdChild.summary, createdChild.id);
      childCount++;
    }
  }

  console.log(
    `✅ Seeded ${parentCount} parent tickets and ${childCount} child tickets`,
  );

  await seedRelatedTicketLinks(idBySummary, userId);
}

async function seedRelatedTicketLinks(
  idBySummary: Map<string, string>,
  userId: string,
) {
  for (const { a, b, reason } of SAMPLE_RELATED_TICKET_LINKS) {
    const aId = idBySummary.get(a);
    const bId = idBySummary.get(b);
    if (!aId || !bId) {
      throw new Error(`Related-ticket seed: missing "${a}" or "${b}"`);
    }
    const [ticketAId, ticketBId] = aId < bId ? [aId, bId] : [bId, aId];
    await prisma.workOrderTicketLink.create({
      data: { ticketAId, ticketBId, reason },
    });
    await prisma.ticketActivity.createMany({
      data: [
        {
          ticketId: aId,
          userId,
          type: "TICKET_LINKED",
          data: { relatedTicketId: bId, relatedTicketSummary: b, reason },
        },
        {
          ticketId: bId,
          userId,
          type: "TICKET_LINKED",
          data: { relatedTicketId: aId, relatedTicketSummary: a, reason },
        },
      ],
    });
  }

  console.log(
    `✅ Seeded ${SAMPLE_RELATED_TICKET_LINKS.length} related-ticket links`,
  );
}
