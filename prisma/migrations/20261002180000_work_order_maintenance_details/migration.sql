-- CreateEnum
CREATE TYPE "MaintenanceAvailability" AS ENUM ('AVAILABLE', 'PARTIAL', 'UNAVAILABLE');

-- AlterTable
ALTER TABLE "work_order_ticket" ADD COLUMN     "availability" "MaintenanceAvailability",
ADD COLUMN     "durationEstimate" INTEGER;
