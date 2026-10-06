-- CreateTable
CREATE TABLE "DeliveryRating" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "driverId" TEXT,
    "score" INTEGER NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeliveryRating_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryRating_shipmentId_key" ON "DeliveryRating"("shipmentId");

-- CreateIndex
CREATE INDEX "DeliveryRating_companyId_driverId_idx" ON "DeliveryRating"("companyId", "driverId");

-- CreateIndex
CREATE INDEX "DeliveryRating_companyId_createdAt_idx" ON "DeliveryRating"("companyId", "createdAt");
