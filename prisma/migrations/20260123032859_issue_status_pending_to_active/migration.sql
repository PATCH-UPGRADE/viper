/*
  Warnings:

  - The values [PENDING] on the enum `IssueStatus` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "IssueStatus_new" AS ENUM ('ACTIVE', 'FALSE_POSITIVE', 'REMEDIATED');
ALTER TABLE "public"."issue" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "issue" ALTER COLUMN "status" TYPE "IssueStatus_new" USING ("status"::text::"IssueStatus_new");
ALTER TYPE "IssueStatus" RENAME TO "IssueStatus_old";
ALTER TYPE "IssueStatus_new" RENAME TO "IssueStatus";
DROP TYPE "public"."IssueStatus_old";
ALTER TABLE "issue" ALTER COLUMN "status" SET DEFAULT 'ACTIVE';
COMMIT;

-- AlterTable
ALTER TABLE "issue" ALTER COLUMN "status" SET DEFAULT 'ACTIVE';
