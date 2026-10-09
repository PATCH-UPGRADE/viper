import "server-only";
import { TRPCError } from "@trpc/server";
import { assetNameSelect, getAssetDisplayName } from "@/features/assets/utils";
import { type Prisma, TicketStatus } from "@/generated/prisma";
import prisma from "@/lib/db";
import { plural } from "@/lib/utils";
import { type Availability, ticketDetailInclude } from "../types";

// What a clinician sees is decided here, from the signed-in user alone: their
// department → the assets it manages → those assets' device tickets. Drafts and
// DONE tickets are never shown.
const open = {
  isDraft: false,
  status: { not: TicketStatus.DONE },
} satisfies Prisma.WorkOrderTicketWhereInput;

const departmentOf = async (userId: string) =>
  (
    await prisma.user.findUnique({
      where: { id: userId },
      select: { departmentId: true },
    })
  )?.departmentId;

const managedBy = (departmentId: string) =>
  ({ managedBy: { some: { departmentId } } }) satisfies Prisma.AssetWhereInput;

// A device ticket this department manages, on an open work order.
const scopedDevice = (departmentId: string) =>
  ({
    asset: managedBy(departmentId),
    ticket: open,
  }) satisfies Prisma.AssetTicketWhereInput;

const inScope = (departmentId: string): Prisma.AssetTicketWhereInput => ({
  ...scopedDevice(departmentId),
  parentTicket: open,
});

// assetNameSelect already reaches the device type for the name; this adds its icon.
const assetSelect = {
  ...assetNameSelect,
  location: true,
  deviceGroup: {
    select: {
      product: {
        select: { deviceType: { select: { displayName: true, icon: true } } },
      },
    },
  },
} as const;

type SelectedAsset = Prisma.AssetGetPayload<{ select: typeof assetSelect }>;

const iconOf = (asset: SelectedAsset) =>
  asset.deviceGroup.product?.deviceType?.icon ?? null;

// "Medical-Surgical Unit · Bed 18"
const placeOf = (location: unknown) => {
  const { building, room } = (location ?? {}) as Record<string, string>;
  return [building, room].filter(Boolean).join(" · ") || null;
};

// The icon for a group of devices: their shared icon, or none if they differ.
const sharedIcon = (icons: (string | null)[]) =>
  icons.every((icon) => icon === icons[0]) ? (icons[0] ?? null) : null;

const AVAILABILITIES: Availability[] = ["AVAILABLE", "PARTIAL", "UNAVAILABLE"];

// TODO: how availability is determined is undecided. Until then this picks a
// value from the work order's id, so it is stable but not real.
const availabilityOf = (workOrder: { id: string }): Availability =>
  AVAILABILITIES[workOrder.id.charCodeAt(workOrder.id.length - 1) % 3];

// Minutes between a work order's start and end, and its availability.
const timing = (w: {
  id: string;
  scheduledAt: Date | null;
  scheduledEndTime: Date | null;
}) => ({
  durationEstimate:
    w.scheduledAt && w.scheduledEndTime
      ? Math.round(
          (w.scheduledEndTime.getTime() - w.scheduledAt.getTime()) / 60_000,
        )
      : null,
  availability: availabilityOf(w),
});

// The list is one row per device ticket. Duration, availability and "unread"
// belong to the owner ticket: a reader opens that, not every device ticket.
const itemSelect = (userId: string) =>
  ({
    parentTicketId: true,
    parentTicket: {
      select: {
        id: true,
        summary: true,
        scheduledAt: true,
        scheduledEndTime: true,
        seenBy: { where: { userId }, select: { userId: true } },
      },
    },
    asset: { select: assetSelect },
    ticket: {
      select: {
        id: true,
        summary: true,
        status: true,
        category: true,
        scheduledAt: true,
      },
    },
  }) satisfies Prisma.AssetTicketSelect;

type ItemRow = Prisma.AssetTicketGetPayload<{
  select: ReturnType<typeof itemSelect>;
}>;

const toItem = ({ parentTicketId, parentTicket, asset, ticket }: ItemRow) => ({
  id: ticket.id,
  summary: ticket.summary,
  status: ticket.status,
  category: ticket.category,
  // A device ticket with no time of its own is on its owner's schedule.
  scheduledAt: ticket.scheduledAt ?? parentTicket.scheduledAt,
  unread: parentTicket.seenBy.length === 0,
  workOrderId: parentTicketId,
  workOrderSummary: parentTicket.summary,
  ...timing(parentTicket),
  assetName: getAssetDisplayName(asset),
  place: placeOf(asset.location),
});

// A work order that owns device tickets ("owner ticket") is on the calendar at
// its own time, as "N devices". A device ticket only gets its own event when
// its time differs from its owner's, and never shows an unread dot.
export const getInterruptionCalendar = async (
  userId: string,
  range: { from: Date; to: Date },
) => {
  const departmentId = await departmentOf(userId);
  if (!departmentId) return [];

  const inRange = { scheduledAt: { gte: range.from, lte: range.to } };
  const [owners, devices] = await Promise.all([
    prisma.workOrderTicket.findMany({
      where: {
        ...open,
        ...inRange,
        assets: { some: scopedDevice(departmentId) },
      },
      select: {
        id: true,
        summary: true,
        status: true,
        category: true,
        scheduledAt: true,
        scheduledEndTime: true,
        seenBy: { where: { userId }, select: { userId: true } },
        assets: {
          where: scopedDevice(departmentId),
          select: {
            asset: { select: assetSelect },
            ticket: { select: { scheduledAt: true } },
          },
        },
      },
    }),
    prisma.assetTicket.findMany({
      where: { ...inScope(departmentId), ticket: { ...open, ...inRange } },
      select: {
        parentTicketId: true,
        parentTicket: {
          select: {
            id: true,
            summary: true,
            scheduledAt: true,
            scheduledEndTime: true,
          },
        },
        asset: { select: assetSelect },
        ticket: {
          select: { id: true, status: true, category: true, scheduledAt: true },
        },
      },
    }),
  ]);
  // Both queries only return tickets with a time.
  return [
    ...owners.flatMap((owner) => {
      // A device with its own time is on the calendar at that time instead.
      const here = owner.assets.filter(
        ({ ticket }) =>
          !ticket.scheduledAt ||
          ticket.scheduledAt.getTime() === owner.scheduledAt?.getTime(),
      );
      if (here.length === 0) return [];
      return {
        id: owner.id,
        workOrderId: owner.id,
        category: owner.category,
        summary: owner.summary,
        status: owner.status,
        scheduledAt: owner.scheduledAt as Date,
        ...timing(owner),
        unread: owner.seenBy.length === 0,
        deviceCount: here.length,
        icon: sharedIcon(here.map(({ asset }) => iconOf(asset))),
        assetName: `${here.length} ${plural("device", here.length)}`,
      };
    }),
    ...devices
      .filter(
        ({ ticket, parentTicket }) =>
          ticket.scheduledAt?.getTime() !== parentTicket.scheduledAt?.getTime(),
      )
      .map(({ parentTicketId, parentTicket, asset, ticket }) => ({
        id: ticket.id,
        workOrderId: parentTicketId,
        category: ticket.category,
        summary: parentTicket.summary,
        status: ticket.status,
        scheduledAt: ticket.scheduledAt as Date,
        ...timing(parentTicket),
        unread: false,
        deviceCount: 1,
        icon: iconOf(asset),
        assetName: getAssetDisplayName(asset),
        place: placeOf(asset.location),
      })),
  ];
};

export const getInterruptionList = async (userId: string) => {
  const departmentId = await departmentOf(userId);
  if (!departmentId) return [];

  const rows = await prisma.assetTicket.findMany({
    where: inScope(departmentId),
    orderBy: { ticket: { scheduledAt: { sort: "asc", nulls: "last" } } },
    take: 500,
    select: itemSelect(userId),
  });
  return rows.map(toItem);
};

// A work order's own details, and the devices it lists: only this
// department's, and never the one being viewed. Other departments' stay hidden.
const workOrderFields = (departmentId: string, id: string) =>
  ({
    id: true,
    body: true,
    scheduledAt: true,
    departments: { select: { id: true, name: true } },
    descriptions: { where: { departmentId }, select: { body: true } },
    // Only this department's readers; other departments' users stay hidden.
    seenBy: {
      where: { user: { departmentId } },
      select: {
        seenAt: true,
        user: {
          select: {
            id: true,
            name: true,
            image: true,
            department: { select: { name: true } },
          },
        },
      },
    },
    assets: {
      where: { ticketId: { not: id }, ...scopedDevice(departmentId) },
      select: {
        asset: { select: assetSelect },
        ticket: { select: { id: true, status: true, scheduledAt: true } },
      },
    },
  }) satisfies Prisma.WorkOrderTicketSelect;

const contactSelect = {
  name: true,
  email: true,
  phone: true,
  department: { select: { name: true } },
} satisfies Prisma.UserSelect;

// What the drawer shows beyond the card, for an owner ticket or a device ticket
// in the user's scope. Anything else is NOT_FOUND. A device ticket has no
// description of its own: it comes from its owner ticket.
export const getInterruptionDetail = async (userId: string, id: string) => {
  const departmentId = await departmentOf(userId);
  const ticket = departmentId
    ? await prisma.workOrderTicket.findFirst({
        where: {
          id,
          OR: [
            { ticket: inScope(departmentId) },
            { ...open, assets: { some: scopedDevice(departmentId) } },
          ],
        },
        select: {
          ...workOrderFields(departmentId, id),
          category: true,
          assignee: { select: contactSelect },
          creator: { select: contactSelect },
          ticket: {
            select: {
              parentTicket: { select: workOrderFields(departmentId, id) },
            },
          },
          comments: ticketDetailInclude.comments,
          activities: ticketDetailInclude.activities,
        },
      })
    : null;
  if (!ticket || !departmentId) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Ticket not found" });
  }
  const workOrder = ticket.ticket?.parentTicket ?? ticket;
  // Devices on the work order that this department does not manage.
  const elsewhere = await prisma.assetTicket.findMany({
    where: {
      parentTicketId: workOrder.id,
      ticket: open,
      asset: { managedBy: { none: { departmentId } } },
    },
    select: {
      asset: { select: { managedBy: { select: { departmentId: true } } } },
    },
  });
  return {
    comments: ticket.comments,
    activities: ticket.activities,
    // The `ReadReceipt` shape.
    seenBy: workOrder.seenBy.map(({ seenAt, user }) => ({
      readAt: seenAt,
      user,
    })),
    category: ticket.category,
    workOrderId: workOrder.id,
    isDeviceTicket: Boolean(ticket.ticket),
    departments: workOrder.departments,
    elsewhere: {
      devices: elsewhere.length,
      departments: new Set(
        elsewhere.flatMap((a) => a.asset.managedBy.map((m) => m.departmentId)),
      ).size,
    },
    contact: ticket.assignee ?? ticket.creator,
    why: workOrder.descriptions[0]?.body ?? workOrder.body ?? null,
    otherDevices: workOrder.assets.map(({ asset, ticket }) => ({
      id: ticket.id,
      name: getAssetDisplayName(asset),
      place: placeOf(asset.location),
      status: ticket.status,
      scheduledAt: ticket.scheduledAt ?? workOrder.scheduledAt,
    })),
  };
};
