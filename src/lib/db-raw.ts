import type {
  ExtendedPrismaClient,
  RawPrismaClient,
  RawTransactionClient,
  TransactionClient,
} from "./db";

/**
 * Gives a client back the write methods that its type in `db.ts` leaves out.
 * Only the provenance functions use it, so every write has a history.
 */
export function asRaw(client: ExtendedPrismaClient): RawPrismaClient;
export function asRaw(client: TransactionClient): RawTransactionClient;
export function asRaw(client: unknown): unknown {
  return client;
}
