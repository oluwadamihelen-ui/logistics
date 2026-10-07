-- CreateTable
CREATE TABLE "CityOption" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CityOption_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CityOption_companyId_state_idx" ON "CityOption"("companyId", "state");

-- CreateIndex
CREATE UNIQUE INDEX "CityOption_companyId_state_name_key" ON "CityOption"("companyId", "state", "name");
