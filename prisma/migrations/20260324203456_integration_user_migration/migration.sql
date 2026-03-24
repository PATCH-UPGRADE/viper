-- AlterTable: Add the new column to user FIRST (before dropping anything)
ALTER TABLE "user" ADD COLUMN "integrationUserId" TEXT;

-- Migrate data: for each integration that had an integrationUserId,
-- set the corresponding user's integrationUserId to point back at the integration
UPDATE "user" u
SET "integrationUserId" = i."id"
FROM "integration" i
WHERE i."integrationUserId" = u."id";

-- Now safe to drop the old foreign key and column from integration
ALTER TABLE "public"."integration" DROP CONSTRAINT "integration_integrationUserId_fkey";
DROP INDEX "public"."integration_integrationUserId_idx";
ALTER TABLE "integration" DROP COLUMN "integrationUserId";

-- Add constraints on the new column
CREATE UNIQUE INDEX "user_integrationUserId_key" ON "user"("integrationUserId");
CREATE INDEX "user_integrationUserId_idx" ON "user"("integrationUserId");
ALTER TABLE "user" ADD CONSTRAINT "user_integrationUserId_fkey" FOREIGN KEY ("integrationUserId") REFERENCES "integration"("id") ON DELETE CASCADE ON UPDATE CASCADE;
