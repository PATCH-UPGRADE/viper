-- CreateTable
CREATE TABLE "vendor_session" (
    "id" TEXT NOT NULL,
    "host" TEXT NOT NULL,
    "header" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "udatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vendor_session_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "vendor_session_host_key" ON "vendor_session"("host");
