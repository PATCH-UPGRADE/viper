/*
  Warnings:

  - You are about to drop the column `syncSchedule` on the `integration` table. All the data in the column will be lost.
  - Made the column `syncEvery` on table `integration` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "integration" DROP COLUMN "syncSchedule",
ALTER COLUMN "syncEvery" SET NOT NULL;
