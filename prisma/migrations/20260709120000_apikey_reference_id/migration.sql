-- better-auth's @better-auth/api-key 1.6.x plugin renames the owner column
-- `userId` -> `referenceId` and adds a required `configId`. Rename (not
-- drop/add) so existing keys are preserved.

-- RenameColumn
ALTER TABLE "apikey" RENAME COLUMN "userId" TO "referenceId";

-- RenameForeignKey
ALTER TABLE "apikey" RENAME CONSTRAINT "apikey_userId_fkey" TO "apikey_referenceId_fkey";

-- AddColumn
ALTER TABLE "apikey" ADD COLUMN "configId" TEXT NOT NULL DEFAULT 'default';

-- CreateIndex
CREATE INDEX "apikey_referenceId_idx" ON "apikey"("referenceId");
