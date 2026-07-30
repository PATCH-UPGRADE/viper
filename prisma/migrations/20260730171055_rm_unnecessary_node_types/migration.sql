/*
  Warnings:

  - The values [INITIAL,MANUAL_TRIGGER,HTTP_REQUEST] on the enum `NodeType` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
-- Remove rows still using the retired enum values so the cast below cannot fail.
-- Deleting a Node cascades to its Connection rows.
DELETE FROM "Node" WHERE "type" IN ('INITIAL', 'MANUAL_TRIGGER', 'HTTP_REQUEST');
DELETE FROM "NodeTemplate" WHERE "type" IN ('INITIAL', 'MANUAL_TRIGGER', 'HTTP_REQUEST');
CREATE TYPE "NodeType_new" AS ENUM ('STEP', 'ASSET');
ALTER TABLE "NodeTemplate" ALTER COLUMN "type" TYPE "NodeType_new" USING ("type"::text::"NodeType_new");
ALTER TABLE "Node" ALTER COLUMN "type" TYPE "NodeType_new" USING ("type"::text::"NodeType_new");
ALTER TYPE "NodeType" RENAME TO "NodeType_old";
ALTER TYPE "NodeType_new" RENAME TO "NodeType";
DROP TYPE "public"."NodeType_old";
COMMIT;
