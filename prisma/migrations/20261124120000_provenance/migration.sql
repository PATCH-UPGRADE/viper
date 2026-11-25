-- CreateEnum
CREATE TYPE "ProvenanceSource" AS ENUM ('INTEGRATION', 'MANUAL', 'API_CLIENT', 'AUTOMATION', 'EMAIL');

-- CreateEnum
CREATE TYPE "ProvenanceEntityType" AS ENUM ('ASSET', 'WORK_ORDER', 'NOTIFICATION');

-- CreateEnum
CREATE TYPE "ObservationKind" AS ENUM ('CREATE', 'SNAPSHOT', 'PATCH', 'TOMBSTONE');

-- CreateTable
CREATE TABLE "observation" (
    "id" TEXT NOT NULL,
    "seq" SERIAL NOT NULL,
    "entityType" "ProvenanceEntityType" NOT NULL,
    "entityId" TEXT NOT NULL,
    "source" "ProvenanceSource" NOT NULL,
    "integrationId" TEXT,
    "integrationName" TEXT,
    "actorUserId" TEXT,
    "sourceRecordId" TEXT,
    "kind" "ObservationKind" NOT NULL,
    "fields" JSONB NOT NULL,
    "raw" JSONB,
    "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "observation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "field_change" (
    "id" TEXT NOT NULL,
    "seq" SERIAL NOT NULL,
    "entityType" "ProvenanceEntityType" NOT NULL,
    "entityId" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "oldValue" JSONB,
    "newValue" JSONB,
    "reason" TEXT,
    "observationId" TEXT NOT NULL,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "field_change_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "observation_entityType_entityId_seq_idx" ON "observation"("entityType", "entityId", "seq");

-- CreateIndex
CREATE INDEX "observation_entityType_entityId_kind_idx" ON "observation"("entityType", "entityId", "kind");

-- CreateIndex
CREATE INDEX "observation_entityType_entityId_source_integrationId_seq_idx" ON "observation"("entityType", "entityId", "source", "integrationId", "seq");

-- CreateIndex
CREATE INDEX "observation_integrationId_observedAt_idx" ON "observation"("integrationId", "observedAt");

-- CreateIndex
CREATE INDEX "observation_actorUserId_idx" ON "observation"("actorUserId");

-- CreateIndex
CREATE INDEX "observation_sourceRecordId_idx" ON "observation"("sourceRecordId");

-- CreateIndex
CREATE INDEX "field_change_entityType_entityId_field_seq_idx" ON "field_change"("entityType", "entityId", "field", "seq" DESC);

-- CreateIndex
CREATE INDEX "field_change_entityType_entityId_seq_idx" ON "field_change"("entityType", "entityId", "seq");

-- CreateIndex
CREATE INDEX "field_change_entityType_field_changedAt_idx" ON "field_change"("entityType", "field", "changedAt");

-- CreateIndex
CREATE INDEX "field_change_observationId_idx" ON "field_change"("observationId");

-- AddForeignKey
ALTER TABLE "observation" ADD CONSTRAINT "observation_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "integration"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "observation" ADD CONSTRAINT "observation_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "observation" ADD CONSTRAINT "observation_sourceRecordId_fkey" FOREIGN KEY ("sourceRecordId") REFERENCES "source_record"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_change" ADD CONSTRAINT "field_change_observationId_fkey" FOREIGN KEY ("observationId") REFERENCES "observation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- integrationName is set exactly when the source is an integration. Prisma
-- cannot express a CHECK, so the schema does not show it.
ALTER TABLE "observation" ADD CONSTRAINT "observation_integration_name_matches_source"
  CHECK (("source" = 'INTEGRATION') = ("integrationName" IS NOT NULL));
