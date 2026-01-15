/*
  Warnings:

  - You are about to drop the column `lastSyncStatusId` on the `integration` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[apiKeyId]` on the table `integration` will be added. If there are existing duplicate values, this will fail.
  - Made the column `userId` on table `asset` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "asset" ALTER COLUMN "userId" SET NOT NULL;

-- AlterTable
ALTER TABLE "integration" DROP COLUMN "lastSyncStatusId",
ADD COLUMN     "apiKeyId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "integration_apiKeyId_key" ON "integration"("apiKeyId");

-- AddForeignKey
ALTER TABLE "integration" ADD CONSTRAINT "integration_apiKeyId_fkey" FOREIGN KEY ("apiKeyId") REFERENCES "apikey"("id") ON DELETE SET NULL ON UPDATE CASCADE;
