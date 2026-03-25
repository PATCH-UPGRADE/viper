/*
  Warnings:

  - A unique constraint covering the columns `[integrationUserId]` on the table `integration` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "integration_integrationUserId_key" ON "integration"("integrationUserId");
