/**
 * A demo week for the clinician calendar at /tracking/interruptions: lone and
 * overlapping events, short events, a chain of overlaps, an event past
 * midnight, and a work order with one device moved to another day.
 *
 * Run:   npm run db:seed-calendar-demo
 * Reset: npm run db:seed-calendar-demo -- --reset
 *
 * Needs the seed user (npm run db:seed). It only touches the work orders it
 * created (chatToolCallId "calendar-demo-*").
 */
import { addDays, addMinutes, startOfWeek } from "date-fns";
import prisma from "@/lib/db";

const MARK = "calendar-demo-";

type Demo = {
  day: number; // 0 = Sunday of the current week
  start: string; // "HH:MM"
  minutes: number;
  summary: string;
  devices: number;
  category?: "FIRMWARE_UPDATE" | "PATCH" | "MAINTENANCE" | "CONFIG_CHANGE";
  read?: boolean;
  // The last device is on its own time, not the work order's.
  moved?: { day: number; start: string };
};

const DEMO: Demo[] = [
  // Monday: one event, nothing around it (full width), six devices.
  {
    day: 1,
    start: "09:00",
    minutes: 90,
    summary: "Update infusion pump firmware",
    devices: 6,
    category: "FIRMWARE_UPDATE",
    read: true,
  },
  // Tuesday: a short lone event, an overlapping pair, and a lone event after.
  {
    day: 2,
    start: "10:00",
    minutes: 20,
    summary: "Replace ECG lead wires",
    devices: 1,
    category: "MAINTENANCE",
  },
  {
    day: 2,
    start: "13:00",
    minutes: 60,
    summary: "Patch bedside monitors",
    devices: 3,
    category: "PATCH",
  },
  {
    day: 2,
    start: "13:30",
    minutes: 60,
    summary: "Calibrate infusion pumps",
    devices: 2,
    category: "MAINTENANCE",
  },
  {
    day: 2,
    start: "16:30",
    minutes: 60,
    summary: "Nurse station workstation update",
    devices: 1,
    category: "PATCH",
  },
  // Two devices, one moved to Thursday: Tuesday's badge counts only one.
  {
    day: 2,
    start: "11:00",
    minutes: 60,
    summary: "Replace infusion pump batteries",
    devices: 2,
    category: "MAINTENANCE",
    moved: { day: 4, start: "15:30" },
  },
  // Wednesday: the screenshot's day. A short event, a lone event, an overlapping pair.
  {
    day: 3,
    start: "07:00",
    minutes: 30,
    summary: "Pharmacy dispensing cabinet restart",
    devices: 2,
    category: "MAINTENANCE",
  },
  {
    day: 3,
    start: "10:00",
    minutes: 60,
    summary: "Check ventilator alarms",
    devices: 1,
    category: "MAINTENANCE",
    read: true,
  },
  {
    day: 3,
    start: "14:00",
    minutes: 60,
    summary: "Infusion pump software update",
    devices: 6,
    category: "FIRMWARE_UPDATE",
  },
  {
    day: 3,
    start: "14:30",
    minutes: 60,
    summary: "Monitor software update",
    devices: 3,
    category: "FIRMWARE_UPDATE",
  },
  // Thursday: two short events, then a chain (A overlaps B, B overlaps C, A and C do not overlap).
  {
    day: 4,
    start: "09:00",
    minutes: 20,
    summary: "Restart lab analyzer",
    devices: 1,
    category: "MAINTENANCE",
  },
  {
    day: 4,
    start: "11:00",
    minutes: 20,
    summary: "Swap network switch",
    devices: 1,
    category: "CONFIG_CHANGE",
  },
  {
    day: 4,
    start: "13:00",
    minutes: 60,
    summary: "Patch imaging workstations",
    devices: 2,
    category: "PATCH",
  },
  {
    day: 4,
    start: "13:30",
    minutes: 60,
    summary: "Update PACS viewer",
    devices: 1,
    category: "PATCH",
  },
  {
    day: 4,
    start: "14:15",
    minutes: 60,
    summary: "Firewall rule review",
    devices: 1,
    category: "CONFIG_CHANGE",
  },
  // Friday: a lone event, then one that runs past midnight.
  {
    day: 5,
    start: "15:00",
    minutes: 60,
    summary: "Reimage reading workstation",
    devices: 1,
    category: "PATCH",
  },
  {
    day: 5,
    start: "23:30",
    minutes: 60,
    summary: "Overnight server patching",
    devices: 3,
    category: "PATCH",
  },
  // Saturday: two short events with nothing around them.
  {
    day: 6,
    start: "09:00",
    minutes: 20,
    summary: "Replace power supply",
    devices: 1,
    category: "MAINTENANCE",
  },
  {
    day: 6,
    start: "11:00",
    minutes: 20,
    summary: "Check firmware version",
    devices: 1,
    category: "FIRMWARE_UPDATE",
  },
];

async function reset() {
  const { count } = await prisma.workOrderTicket.deleteMany({
    where: { chatToolCallId: { startsWith: MARK } },
  });
  console.log(
    `Removed ${count} demo work orders (their device tickets go with them).`,
  );
}

async function main() {
  await reset();
  if (process.argv.includes("--reset")) return;

  const user = await prisma.user.findUniqueOrThrow({
    where: { email: "user@example.com" },
    select: { id: true, departmentId: true },
  });
  if (!user.departmentId) throw new Error("The seed user has no department.");

  const assets = await prisma.asset.findMany({
    where: { managedBy: { some: { departmentId: user.departmentId } } },
    orderBy: { id: "asc" },
    select: { id: true },
    take: 40,
  });
  if (assets.length < 6) throw new Error("Not enough managed assets to seed.");

  const sunday = startOfWeek(new Date());
  let next = 0;
  const timeOf = (day: number, start: string) => {
    const [hour, minute] = start.split(":").map(Number);
    const time = addDays(sunday, day);
    time.setHours(hour, minute, 0, 0);
    return time;
  };
  for (const [index, demo] of DEMO.entries()) {
    const scheduledAt = timeOf(demo.day, demo.start);
    const base = {
      summary: demo.summary,
      body: "Keeps these devices supported and secure. Expect each device to restart once.",
      status: "TO_DO" as const,
      category: demo.category ?? "MAINTENANCE",
      creatorId: user.id,
      assigneeId: user.id,
      scheduledAt,
    };
    const owner = await prisma.workOrderTicket.create({
      data: {
        ...base,
        scheduledEndTime: addMinutes(scheduledAt, demo.minutes),
        chatToolCallId: `${MARK}${index}`,
      },
    });
    for (let i = 0; i < demo.devices; i++) {
      const asset = assets[next++ % assets.length];
      const moved = i === demo.devices - 1 ? demo.moved : undefined;
      const child = await prisma.workOrderTicket.create({
        data: {
          ...base,
          scheduledAt: moved ? timeOf(moved.day, moved.start) : scheduledAt,
          parentId: owner.id,
        },
      });
      await prisma.assetTicket.create({
        data: {
          assetId: asset.id,
          parentTicketId: owner.id,
          ticketId: child.id,
        },
      });
    }
    if (demo.read) {
      await prisma.ticketSeen.create({
        data: { userId: user.id, ticketId: owner.id },
      });
    }
  }
  console.log(
    `Seeded ${DEMO.length} demo work orders for the week of ${sunday.toDateString()}.`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
