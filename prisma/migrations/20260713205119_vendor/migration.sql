/*
  Warnings:

  - You are about to drop the column `udatedAt` on the `vendor_session` table. All the data in the column will be lost.
  - Added the required column `updatedAt` to the `vendor_session` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "vendor_session" DROP COLUMN "udatedAt",
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;
