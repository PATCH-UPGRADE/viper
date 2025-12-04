/*
  Warnings:

  - You are about to drop the `asset_settings` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "public"."asset_settings" DROP CONSTRAINT "asset_settings_userId_fkey";

-- AlterTable
ALTER TABLE "vulnerability" ALTER COLUMN "exploit-uri" DROP NOT NULL;

-- DropTable
DROP TABLE "public"."asset_settings";

-- CreateTable
CREATE TABLE "asset_credentials" (
    "id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "lastUsed" TIMESTAMP(3),
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "asset_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vulnerability_credentials" (
    "id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastUsed" TIMESTAMP(3),

    CONSTRAINT "vulnerability_credentials_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "asset_credentials" ADD CONSTRAINT "asset_credentials_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vulnerability_credentials" ADD CONSTRAINT "vulnerability_credentials_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
