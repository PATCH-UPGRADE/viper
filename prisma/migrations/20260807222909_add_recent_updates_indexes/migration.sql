-- CreateIndex
CREATE INDEX "asset_createdAt_idx" ON "asset"("createdAt");

-- CreateIndex
CREATE INDEX "notification_type_createdAt_idx" ON "notification"("type", "createdAt");

-- CreateIndex
CREATE INDEX "ticket_activity_type_createdAt_idx" ON "ticket_activity"("type", "createdAt");
