/*
  Warnings:

  - The `hospitalImpact` column on the `notification` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- AlterTable
ALTER TABLE "notification" DROP COLUMN "hospitalImpact",
ADD COLUMN     "hospitalImpact" JSONB NOT NULL DEFAULT '{}';
