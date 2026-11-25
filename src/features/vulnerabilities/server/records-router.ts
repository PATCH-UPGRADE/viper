import { TRPCError } from "@trpc/server";
import { z } from "zod";
import prisma from "@/lib/db";
import { createTRPCRouter, protectedProcedure } from "@/trpc/init";
import { requireOwnership } from "@/trpc/middleware";
import {
  toVulnerabilityRecordResponse,
  type VulnerabilityRecordInput,
  vulnerabilityRecordArrayInputSchema,
  vulnerabilityRecordDeleteResponseSchema,
  vulnerabilityRecordInclude,
  vulnerabilityRecordInputSchema,
  vulnerabilityRecordResponseSchema,
  vulnerabilityRecordUpdateInputSchema,
} from "../types";
import { recordDataFromInput, recordPatchFromInput } from "./record-input";
import {
  createVulnerabilityRecord,
  deleteVulnerabilityRecord,
  updateVulnerabilityRecord,
} from "./records";

async function readRecord(id: string) {
  return toVulnerabilityRecordResponse(
    await prisma.vulnerabilityRecord.findUniqueOrThrow({
      where: { id },
      include: vulnerabilityRecordInclude,
    }),
  );
}

async function createRecord(input: VulnerabilityRecordInput, userId: string) {
  const { record } = await createVulnerabilityRecord(
    await recordDataFromInput(input, { userId }),
  );
  return readRecord(record.id);
}

/**
 * Only its owner may change a record that has one. No user may change one an integration synced,
 * and anyone may change the rest (feed records and MedISAO stubs).
 */
async function requireEditableRecord(id: string, userId: string) {
  const { userId: ownerId } = await requireOwnership(
    id,
    userId,
    "vulnerabilityRecord",
    { allowUnowned: true },
  );
  if (ownerId !== null) return;

  const mapping = await prisma.externalVulnerabilityRecordMapping.findUnique({
    where: { itemId: id },
    select: { id: true },
  });
  if (mapping) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "An integration synced this record, so you can't change it",
    });
  }
}

export const vulnerabilityRecordsRouter = createTRPCRouter({
  // POST /api/vulnerabilityRecords - Create a record
  create: protectedProcedure
    .input(vulnerabilityRecordInputSchema)
    .meta({
      openapi: {
        method: "POST",
        path: "/vulnerabilityRecords",
        tags: ["Vulnerabilities"],
        summary: "Create Vulnerability Record",
        description:
          "Record one source's statement about a vulnerability. The record joins the vulnerability that any of its identifiers already belongs to, or creates one. Its devices are added to that vulnerability. The authenticated user owns the record.",
      },
    })
    .output(vulnerabilityRecordResponseSchema)
    .mutation(({ ctx, input }) => createRecord(input, ctx.auth.user.id)),

  // POST /api/vulnerabilityRecords/bulk - Create several records
  createBulk: protectedProcedure
    .input(vulnerabilityRecordArrayInputSchema)
    .meta({
      openapi: {
        method: "POST",
        path: "/vulnerabilityRecords/bulk",
        tags: ["Vulnerabilities"],
        summary: "Create Bulk Vulnerability Records",
        description:
          "Create several records, in order. Not atomic: if one fails, the request fails and the records before it are kept.",
      },
    })
    .output(z.array(vulnerabilityRecordResponseSchema))
    .mutation(async ({ ctx, input }) => {
      const created = [];
      for (const record of input.records) {
        created.push(await createRecord(record, ctx.auth.user.id));
      }
      return created;
    }),

  // PUT /api/vulnerabilityRecords/{id} - Update a record (see requireEditableRecord)
  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        data: vulnerabilityRecordUpdateInputSchema,
      }),
    )
    .meta({
      openapi: {
        method: "PUT",
        path: "/vulnerabilityRecords/{id}",
        tags: ["Vulnerabilities"],
        summary: "Update Vulnerability Record",
        description:
          "Update a record. Fields left out are unchanged; metrics replace the record's metrics, and devices are added to the vulnerability. A record can only be updated by the user who created it; records an integration synced belong to that integration.",
      },
    })
    .output(vulnerabilityRecordResponseSchema)
    .mutation(async ({ ctx, input }) => {
      await requireEditableRecord(input.id, ctx.auth.user.id);
      await updateVulnerabilityRecord(
        input.id,
        await recordPatchFromInput(input.data),
      );
      return readRecord(input.id);
    }),

  // DELETE /api/vulnerabilityRecords/{id} - Delete a record (see requireEditableRecord)
  remove: protectedProcedure
    .input(z.object({ id: z.string() }))
    .meta({
      openapi: {
        method: "DELETE",
        path: "/vulnerabilityRecords/{id}",
        tags: ["Vulnerabilities"],
        summary: "Delete Vulnerability Record",
        description:
          "Delete a record. Deleting a vulnerability's last record (other than EPSS and KEV ones) deletes the vulnerability too. A record can only be deleted by the user who created it; records an integration synced belong to that integration.",
      },
    })
    .output(vulnerabilityRecordDeleteResponseSchema)
    .mutation(async ({ ctx, input }) => {
      await requireEditableRecord(input.id, ctx.auth.user.id);
      const result = await deleteVulnerabilityRecord(input.id);
      return { id: input.id, ...result };
    }),
});
