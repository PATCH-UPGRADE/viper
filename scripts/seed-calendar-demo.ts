/**
 * A demo week for the clinician calendar at /tracking/interruptions. Needs the
 * seed user (npm run db:seed). Re-running replaces only its own work orders.
 *
 * Run:   npm run db:seed-calendar-demo
 * Reset: npm run db:seed-calendar-demo -- --reset
 */
import { addDays, addMinutes, startOfWeek } from "date-fns";
import prisma from "@/lib/db";

const MARK = "calendar-demo-";

// [day (0 = Sunday), start, minutes, devices, summary, day the last device moves to]
const DEMO: [number, string, number, number, string, number?][] = [
  [1, "09:00", 90, 6, "Update infusion pump firmware"], // alone: full width
  [2, "10:00", 20, 1, "Replace ECG lead wires"], // short: title only
  [2, "11:00", 60, 2, "Replace infusion pump batteries", 4], // one device on Thursday
  [2, "13:00", 60, 3, "Patch bedside monitors"], // overlaps the next
  [2, "13:30", 60, 2, "Calibrate infusion pumps"],
  [4, "13:00", 60, 2, "Patch imaging workstations"], // a chain: first and last
  [4, "13:30", 60, 1, "Update PACS viewer"], // don't overlap, the middle
  [4, "14:15", 60, 1, "Firewall rule review"], // overlaps both
  [5, "23:30", 60, 3, "Overnight server patching"], // runs past midnight
  [6, "09:00", 20, 1, "Replace power supply"],
];

const timeOf = (day: number, start: string) => {
  const [hour, minute] = start.split(":").map(Number);
  const time = addDays(startOfWeek(new Date()), day);
  time.setHours(hour, minute, 0, 0);
  return time;
};

async function main() {
  await prisma.workOrderTicket.deleteMany({
    where: { chatToolCallId: { startsWith: MARK } },
  });
  if (process.argv.includes("--reset")) return;

  const user = await prisma.user.findUniqueOrThrow({
    where: { email: "user@example.com" },
    select: { id: true, departmentId: true },
  });
  const assets = await prisma.asset.findMany({
    where: { managedBy: { some: { departmentId: user.departmentId ?? "" } } },
    select: { id: true },
  });
  if (assets.length < 6)
    throw new Error("The seed user's department needs 6+ assets.");

  let next = 0;
  for (const [day, start, minutes, devices, summary, movedTo] of DEMO) {
    const scheduledAt = timeOf(day, start);
    const base = {
      summary,
      scheduledAt,
      creatorId: user.id,
      category: "MAINTENANCE",
    } as const;
    const owner = await prisma.workOrderTicket.create({
      data: {
        ...base,
        scheduledEndTime: addMinutes(scheduledAt, minutes),
        chatToolCallId: MARK + summary,
      },
    });
    for (let i = 0; i < devices; i++) {
      const moved = movedTo !== undefined && i === devices - 1;
      const child = await prisma.workOrderTicket.create({
        data: {
          ...base,
          scheduledAt: moved ? timeOf(movedTo, start) : scheduledAt,
          parentId: owner.id,
        },
      });
      await prisma.assetTicket.create({
        data: {
          assetId: assets[next++ % assets.length].id,
          parentTicketId: owner.id,
          ticketId: child.id,
        },
      });
    }
  }
  console.log(`Seeded ${DEMO.length} work orders.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
