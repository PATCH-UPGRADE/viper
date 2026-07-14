/*
  Warnings:

  - You are about to drop the `vendor_session` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropTable
DROP TABLE "vendor_session";

-- CreateTable
CREATE TABLE "integration_session" (
    "id" TEXT NOT NULL,
    "host" TEXT NOT NULL,
    "header" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "integration_session_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "integration_session_host_key" ON "integration_session"("host");
