import "server-only";
import prisma from "@/lib/db";
import {
  buildPaginationMeta,
  createPaginatedResponse,
  createPaginatedResponseWithLinksSchema,
  type PaginationInput,
} from "./pagination";
import {
  PrismaClientKnownRequestError,
  PrismaClientValidationError,
} from "@/generated/prisma/runtime/library";
import { integrationInputSchema } from "@/features/integrations/types";

export async function cpeToDeviceGroup(cpe: string) {
  // requires: cpe is properly formatted according to cpeSchema
  // outputs: the DeviceGroup model instance that `cpe` specifies (creates a new one if none exist)

  // TODO: VW-38 create a cpe naming table here to standardize input
  // when creating a new device group, also populate Manufacturer, model name, version fields
  return prisma.deviceGroup.upsert({
    where: { cpe },
    update: {},
    create: { cpe },
  });
}

export async function cpesToDeviceGroups(cpes: string[]) {
  const deviceGroups = await Promise.all(
    cpes.map((cpe) => cpeToDeviceGroup(cpe)),
  );
  return deviceGroups;
}

type PrismaDelegate = {
  // biome-ignore lint/suspicious/noExplicitAny: use any because it allows us to reuse this fn for multiple models
  count: (args: any) => Promise<number | any>;
  // biome-ignore lint/suspicious/noExplicitAny: use any because it allows us to reuse this fn for multiple models
  findMany: (args: any) => Promise<any[]>;
};

export async function fetchPaginated<
  TDelegate extends PrismaDelegate,
  TArgs extends Parameters<TDelegate["findMany"]>[0],
>(
  delegate: TDelegate,
  input: PaginationInput,
  args: Omit<TArgs, "skip" | "take">,
) {
  const totalCount = await delegate.count({
    where: args.where,
  });

  const meta = buildPaginationMeta(input, totalCount);

  const items = await delegate.findMany({
    orderBy: { createdAt: "desc" },
    ...args,
    skip: meta.skip,
    take: meta.take,
  } as TArgs);

  return createPaginatedResponse(items, meta);
}

export const handlePrismaError = (e: unknown): string => {
  if (
    e instanceof PrismaClientKnownRequestError ||
    e instanceof PrismaClientValidationError
  ) {
    return e.message;
  }

  return "Internal Server Error";
};
