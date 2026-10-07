-- CreateEnum
CREATE TYPE "DeliveryMethod" AS ENUM ('HOME_DELIVERY', 'HUB_PICKUP');

-- AlterEnum
ALTER TYPE "HubType" ADD VALUE 'PICKUP_POINT';

-- AlterEnum
ALTER TYPE "ShipmentStatus" ADD VALUE 'READY_FOR_PICKUP';

-- AlterTable
ALTER TABLE "Hub" ADD COLUMN     "allowsCollection" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "openingHours" TEXT;

-- AlterTable
ALTER TABLE "Shipment" ADD COLUMN     "collectedByName" TEXT,
ADD COLUMN     "collectionHubId" TEXT,
ADD COLUMN     "deliveryMethod" "DeliveryMethod" NOT NULL DEFAULT 'HOME_DELIVERY',
ADD COLUMN     "readyForPickupAt" TIMESTAMP(3);

-- AddForeignKey
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_collectionHubId_fkey" FOREIGN KEY ("collectionHubId") REFERENCES "Hub"("id") ON DELETE SET NULL ON UPDATE CASCADE;
