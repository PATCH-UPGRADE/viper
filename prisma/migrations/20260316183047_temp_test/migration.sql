/*
  Warnings:

  - Added the required column `testValue` to the `verification` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "verification" ADD COLUMN     "testValue" TEXT NOT NULL;
