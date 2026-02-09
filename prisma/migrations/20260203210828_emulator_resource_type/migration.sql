/*
  Warnings:

  - The values [Emulator] on the enum `ResourceType` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
ALTER TYPE "ResourceType" RENAME VALUE 'Emulator' TO 'DeviceArtifact';
COMMIT;
