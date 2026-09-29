/*
  Warnings:

  - You are about to drop the column `tlp` on the `notification` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "notification" DROP COLUMN "tlp";

-- AlterTable
ALTER TABLE "source_record" ADD COLUMN     "tlp" "Tlp";
