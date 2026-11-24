import { type Prisma, PrismaClient } from "@/generated/prisma";
import type { UnwrapTuple } from "@/generated/prisma/runtime/library";
import {
  artifactExtension,
  deviceCatalogExtension,
  mappingUrlExtension,
  sendWebhooksExtension,
  vulnerabilityExtension,
} from "./prisma-client-extensions";

const createPrismaClient = () =>
  new PrismaClient()
    .$extends(artifactExtension)
    .$extends(deviceCatalogExtension)
    .$extends(vulnerabilityExtension)
    .$extends(sendWebhooksExtension)
    .$extends(mappingUrlExtension);

/** The client with every write. `asRaw` in `db-raw.ts` casts to it. */
export type RawPrismaClient = ReturnType<typeof createPrismaClient>;
export type RawTransactionClient = Parameters<
  Parameters<RawPrismaClient["$transaction"]>[0]
>[0];

// Models that only the provenance functions may write.
// TODO VW-605 (PR 11, PR 13): add workOrderTicket and notification.
type TrackedModel = "asset";

// The methods to keep, so a new write method is blocked by default. Symbol keys
// hold the types that Prisma.Result infers from.
type ReadOnlyDelegate<D> = Pick<
  D,
  Extract<
    keyof D,
    | "findUnique"
    | "findUniqueOrThrow"
    | "findFirst"
    | "findFirstOrThrow"
    | "findMany"
    | "count"
    | "aggregate"
    | "groupBy"
    | "fields"
    | symbol
  >
>;

type ReadOnlyModels<C extends Record<TrackedModel, unknown>> = {
  [M in TrackedModel]: ReadOnlyDelegate<C[M]>;
};

export type TransactionClient = Omit<RawTransactionClient, TrackedModel> &
  ReadOnlyModels<RawTransactionClient>;

export type ExtendedPrismaClient = Omit<
  RawPrismaClient,
  TrackedModel | "$transaction"
> &
  ReadOnlyModels<RawPrismaClient> & {
    // biome-ignore lint/suspicious/noExplicitAny: as in Prisma's own type
    $transaction<P extends Prisma.PrismaPromise<any>[]>(
      queries: [...P],
      options?: { isolationLevel?: Prisma.TransactionIsolationLevel },
    ): Promise<UnwrapTuple<P>>;
    $transaction<R>(
      fn: (tx: TransactionClient) => Promise<R>,
      options?: {
        maxWait?: number;
        timeout?: number;
        isolationLevel?: Prisma.TransactionIsolationLevel;
      },
    ): Promise<R>;
  };

// see https://www.prisma.io/docs/guides/nextjs#26-set-up-prisma-client
const globalForPrisma = globalThis as unknown as {
  prisma?: ExtendedPrismaClient;
};

const prisma: ExtendedPrismaClient =
  globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export default prisma;

// TODO: these should eventually get moved to /types.ts
// However, I'm not touching them now becuase I think we're retiring everything these are currently
// being used for (VulnerabilityItem / VulnerabilityDrawer)
export type VulnerabilityWithIssues = Prisma.VulnerabilityGetPayload<{
  include: {
    issues: true;
    deviceGroupMatchings: true;
  };
}>;
