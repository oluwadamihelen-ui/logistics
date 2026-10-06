-- CreateEnum
CREATE TYPE "Role" AS ENUM ('PLATFORM_SUPER_ADMIN', 'COMPANY_OWNER', 'COMPANY_ADMIN', 'OPERATIONS_MANAGER', 'BRANCH_MANAGER', 'DISPATCH_MANAGER', 'DISPATCHER', 'FLEET_MANAGER', 'DRIVER', 'RIDER', 'WAREHOUSE_STAFF', 'CUSTOMER_SERVICE', 'ACCOUNTANT', 'SALES_STAFF', 'HR_ADMIN', 'CUSTOMER', 'SENDER', 'RECIPIENT');

-- CreateEnum
CREATE TYPE "CompanyStatus" AS ENUM ('ONBOARDING', 'ACTIVE', 'SUSPENDED', 'CLOSED');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELLED', 'EXPIRED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "BillingInterval" AS ENUM ('MONTHLY', 'ANNUAL');

-- CreateEnum
CREATE TYPE "ShipmentStatus" AS ENUM ('CREATED', 'CONFIRMED', 'PICKUP_ASSIGNED', 'PICKED_UP', 'AT_HUB', 'SORTING', 'READY_FOR_DISPATCH', 'ASSIGNED_FOR_DELIVERY', 'OUT_FOR_DELIVERY', 'DELIVERED', 'DELIVERY_FAILED', 'RESCHEDULED', 'RETURNING', 'RETURNED_TO_HUB', 'RETURNED_TO_SENDER', 'CANCELLED');

-- CreateEnum
CREATE TYPE "Priority" AS ENUM ('STANDARD', 'EXPRESS', 'URGENT', 'SAME_DAY');

-- CreateEnum
CREATE TYPE "ShipmentPaymentStatus" AS ENUM ('UNPAID', 'PARTIALLY_PAID', 'PAID', 'CREDIT_ACCOUNT', 'REFUNDED');

-- CreateEnum
CREATE TYPE "ShipmentSource" AS ENUM ('DASHBOARD', 'PORTAL', 'PUBLIC', 'API');

-- CreateEnum
CREATE TYPE "CustomerType" AS ENUM ('INDIVIDUAL', 'BUSINESS', 'CORPORATE', 'MARKETPLACE_SELLER');

-- CreateEnum
CREATE TYPE "PackageType" AS ENUM ('DOCUMENT', 'PARCEL', 'FRAGILE', 'FOOD', 'PHARMACY', 'GROCERY', 'ELECTRONICS', 'FREIGHT', 'OTHER');

-- CreateEnum
CREATE TYPE "FailureReason" AS ENUM ('CUSTOMER_UNAVAILABLE', 'WRONG_ADDRESS', 'PHONE_UNREACHABLE', 'CUSTOMER_REFUSED', 'BUSINESS_CLOSED', 'VEHICLE_ISSUE', 'WEATHER', 'SECURITY_ISSUE', 'INCORRECT_PACKAGE', 'PAYMENT_ISSUE', 'OTHER');

-- CreateEnum
CREATE TYPE "FailureResolution" AS ENUM ('PENDING', 'RESCHEDULED', 'RETRY', 'RETURN_TO_HUB', 'RETURN_TO_SENDER');

-- CreateEnum
CREATE TYPE "AttemptOutcome" AS ENUM ('DELIVERED', 'FAILED');

-- CreateEnum
CREATE TYPE "DriverKind" AS ENUM ('DRIVER', 'RIDER');

-- CreateEnum
CREATE TYPE "DriverStatus" AS ENUM ('AVAILABLE', 'ON_PICKUP', 'ON_DELIVERY', 'IDLE', 'OFFLINE', 'EMERGENCY');

-- CreateEnum
CREATE TYPE "PayModel" AS ENUM ('PER_DELIVERY', 'PER_TRIP', 'PERCENTAGE', 'SALARY', 'HYBRID');

-- CreateEnum
CREATE TYPE "VehicleType" AS ENUM ('MOTORCYCLE', 'CAR', 'VAN', 'TRUCK', 'BUS', 'OTHER');

-- CreateEnum
CREATE TYPE "VehicleStatus" AS ENUM ('AVAILABLE', 'ASSIGNED', 'ON_TRIP', 'MAINTENANCE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "MaintenanceType" AS ENUM ('SERVICE', 'OIL_CHANGE', 'TYRES', 'REPAIR', 'PARTS', 'INSPECTION', 'OTHER');

-- CreateEnum
CREATE TYPE "HubType" AS ENUM ('HUB', 'WAREHOUSE', 'SORTING_CENTER');

-- CreateEnum
CREATE TYPE "RouteStatus" AS ENUM ('PLANNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "StopType" AS ENUM ('PICKUP', 'DELIVERY');

-- CreateEnum
CREATE TYPE "StopStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "CodStatus" AS ENUM ('PENDING', 'COLLECTED', 'PARTIALLY_SETTLED', 'SETTLED', 'DISPUTED');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'BANK_TRANSFER', 'CARD', 'POS', 'WALLET', 'PAYSTACK', 'OTHER');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'SUCCESSFUL', 'FAILED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'ISSUED', 'PARTIALLY_PAID', 'PAID', 'VOID');

-- CreateEnum
CREATE TYPE "ExpenseCategory" AS ENUM ('FUEL', 'VEHICLE_MAINTENANCE', 'DRIVER_EXPENSE', 'STAFF_EXPENSE', 'OFFICE', 'HUB', 'TOLLS', 'PACKAGING', 'OTHER');

-- CreateEnum
CREATE TYPE "SettlementStatus" AS ENUM ('DRAFT', 'APPROVED', 'PAID', 'VOID');

-- CreateEnum
CREATE TYPE "NotificationCategory" AS ENUM ('SHIPMENT', 'DELIVERY', 'PICKUP', 'DISPATCH', 'DRIVER', 'FLEET', 'PAYMENT', 'COD', 'INVOICE', 'CUSTOMER', 'FINANCE', 'MAINTENANCE', 'SYSTEM', 'SECURITY', 'AI_INSIGHT');

-- CreateEnum
CREATE TYPE "NotificationPriority" AS ENUM ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO');

-- CreateEnum
CREATE TYPE "Channel" AS ENUM ('IN_APP', 'EMAIL', 'SMS', 'WHATSAPP', 'PUSH');

-- CreateEnum
CREATE TYPE "DeliveryState" AS ENUM ('PENDING', 'SENT', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "DocumentOwnerType" AS ENUM ('DRIVER', 'VEHICLE', 'STAFF', 'CUSTOMER', 'SHIPMENT', 'COMPANY');

-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('VALID', 'EXPIRING', 'EXPIRED');

-- CreateEnum
CREATE TYPE "TicketStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'WAITING_CUSTOMER', 'RESOLVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "TicketCategory" AS ENUM ('SHIPMENT', 'CUSTOMER', 'DRIVER', 'PAYMENT', 'COD', 'DELIVERY', 'TECHNICAL', 'OTHER');

-- CreateEnum
CREATE TYPE "EmploymentStatus" AS ENUM ('ACTIVE', 'ON_LEAVE', 'SUSPENDED', 'TERMINATED');

-- CreateEnum
CREATE TYPE "AiRole" AS ENUM ('USER', 'ASSISTANT', 'TOOL');

-- CreateEnum
CREATE TYPE "InventoryMovementType" AS ENUM ('RECEIVED', 'USED', 'TRANSFERRED', 'DAMAGED', 'ADJUSTMENT');

-- CreateTable
CREATE TABLE "Company" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "status" "CompanyStatus" NOT NULL DEFAULT 'ONBOARDING',
    "logoUrl" TEXT,
    "businessType" TEXT,
    "registrationNumber" TEXT,
    "taxId" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "website" TEXT,
    "addressLine" TEXT,
    "city" TEXT,
    "state" TEXT,
    "country" TEXT NOT NULL DEFAULT 'NG',
    "currency" TEXT NOT NULL DEFAULT 'NGN',
    "timezone" TEXT NOT NULL DEFAULT 'Africa/Lagos',
    "operatingRegions" TEXT[],
    "onboardingStep" INTEGER NOT NULL DEFAULT 0,
    "onboardedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanySettings" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "shipmentPrefix" TEXT NOT NULL DEFAULT 'SHP',
    "invoicePrefix" TEXT NOT NULL DEFAULT 'INV',
    "trackingPrefix" TEXT NOT NULL DEFAULT 'LX',
    "defaultServiceHours" INTEGER NOT NULL DEFAULT 48,
    "workingHours" JSONB NOT NULL DEFAULT '{"start":"08:00","end":"18:00","days":[1,2,3,4,5,6]}',
    "codEnabled" BOOLEAN NOT NULL DEFAULT true,
    "codFeePercent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "maxDeliveryAttempts" INTEGER NOT NULL DEFAULT 3,
    "returnPolicy" TEXT,
    "dispatchRules" JSONB NOT NULL DEFAULT '{"autoAssign":false,"maxStopsPerRun":15}',
    "proofRequirements" JSONB NOT NULL DEFAULT '{"signature":false,"photo":true,"otp":false,"gps":true,"recipientName":true}',
    "highValueThreshold" DECIMAL(14,2) NOT NULL DEFAULT 100000,
    "highValueProof" JSONB NOT NULL DEFAULT '{"signature":true,"photo":true,"otp":true,"gps":true,"recipientName":true}',
    "driverRequirements" JSONB NOT NULL DEFAULT '{"licenseRequired":true,"vehicleRequired":false}',
    "taxRatePercent" DECIMAL(5,2) NOT NULL DEFAULT 7.5,
    "taxInclusive" BOOLEAN NOT NULL DEFAULT false,
    "invoiceFooter" TEXT,
    "enabledChannels" "Channel"[] DEFAULT ARRAY['IN_APP']::"Channel"[],
    "notificationDefaults" JSONB NOT NULL DEFAULT '{}',
    "bankDetails" JSONB,
    "expiryAlertDays" INTEGER[] DEFAULT ARRAY[30, 14, 7, 1]::INTEGER[],
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanySettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Counter" (
    "companyId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Counter_pkey" PRIMARY KEY ("companyId","key")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "role" "Role" NOT NULL,
    "companyId" TEXT,
    "branchId" TEXT,
    "customerId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "extraPermissions" TEXT[],
    "deniedPermissions" TEXT[],
    "failedLoginCount" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "tokenVersion" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffProfile" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "department" TEXT,
    "jobTitle" TEXT,
    "employmentStatus" "EmploymentStatus" NOT NULL DEFAULT 'ACTIVE',
    "hireDate" TIMESTAMP(3),
    "emergencyName" TEXT,
    "emergencyPhone" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StaffProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubscriptionPlan" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "monthlyPriceKobo" INTEGER,
    "annualPriceKobo" INTEGER,
    "currency" TEXT NOT NULL DEFAULT 'NGN',
    "trialDays" INTEGER NOT NULL DEFAULT 14,
    "limits" JSONB NOT NULL,
    "features" TEXT[],
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "paystackMonthlyPlanCode" TEXT,
    "paystackAnnualPlanCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubscriptionPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'TRIALING',
    "interval" "BillingInterval" NOT NULL DEFAULT 'MONTHLY',
    "trialEndsAt" TIMESTAMP(3),
    "currentPeriodStart" TIMESTAMP(3),
    "currentPeriodEnd" TIMESTAMP(3),
    "graceEndsAt" TIMESTAMP(3),
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "cancelledAt" TIMESTAMP(3),
    "pendingPlanId" TEXT,
    "pendingInterval" "BillingInterval",
    "paystackCustomerCode" TEXT,
    "paystackSubscriptionCode" TEXT,
    "limitOverrides" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingPayment" (
    "id" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'paystack',
    "reference" TEXT NOT NULL,
    "amountKobo" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'NGN',
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "planId" TEXT NOT NULL,
    "interval" "BillingInterval" NOT NULL,
    "paidAt" TIMESTAMP(3),
    "rawResponse" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BillingPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookEvent" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "processedAt" TIMESTAMP(3),
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformSetting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformSetting_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "Branch" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "addressLine" TEXT,
    "city" TEXT,
    "state" TEXT,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Branch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Hub" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "branchId" TEXT,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "type" "HubType" NOT NULL DEFAULT 'HUB',
    "addressLine" TEXT,
    "city" TEXT,
    "state" TEXT,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Hub_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Zone" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "areas" TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Zone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "type" "CustomerType" NOT NULL DEFAULT 'INDIVIDUAL',
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "businessName" TEXT,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CorporateAccount" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "accountManagerId" TEXT,
    "creditLimit" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "paymentTermsDays" INTEGER NOT NULL DEFAULT 30,
    "discountPercent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "apiEnabled" BOOLEAN NOT NULL DEFAULT false,
    "deliveryRules" JSONB,
    "contractStart" TIMESTAMP(3),
    "contractEnd" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CorporateAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Address" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "customerId" TEXT,
    "label" TEXT,
    "contactName" TEXT,
    "contactPhone" TEXT,
    "line1" TEXT NOT NULL,
    "line2" TEXT,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "country" TEXT NOT NULL DEFAULT 'NG',
    "zoneId" TEXT,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Address_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Shipment" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "trackingNumber" TEXT NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "source" "ShipmentSource" NOT NULL DEFAULT 'DASHBOARD',
    "idempotencyKey" TEXT,
    "customerId" TEXT,
    "senderName" TEXT NOT NULL,
    "senderPhone" TEXT NOT NULL,
    "senderEmail" TEXT,
    "pickupAddress" TEXT NOT NULL,
    "pickupCity" TEXT NOT NULL,
    "pickupState" TEXT NOT NULL,
    "pickupLat" DOUBLE PRECISION,
    "pickupLng" DOUBLE PRECISION,
    "pickupZoneId" TEXT,
    "recipientName" TEXT NOT NULL,
    "recipientPhone" TEXT NOT NULL,
    "recipientEmail" TEXT,
    "deliveryAddress" TEXT NOT NULL,
    "deliveryCity" TEXT NOT NULL,
    "deliveryState" TEXT NOT NULL,
    "deliveryLat" DOUBLE PRECISION,
    "deliveryLng" DOUBLE PRECISION,
    "deliveryZoneId" TEXT,
    "packageDescription" TEXT NOT NULL,
    "packageType" "PackageType" NOT NULL DEFAULT 'PARCEL',
    "weightKg" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "lengthCm" DECIMAL(8,2),
    "widthCm" DECIMAL(8,2),
    "heightCm" DECIMAL(8,2),
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "declaredValue" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "specialInstructions" TEXT,
    "notes" TEXT,
    "deliveryFee" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "codAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "paymentStatus" "ShipmentPaymentStatus" NOT NULL DEFAULT 'UNPAID',
    "feePayer" TEXT NOT NULL DEFAULT 'SENDER',
    "priceBreakdown" JSONB,
    "status" "ShipmentStatus" NOT NULL DEFAULT 'CREATED',
    "priority" "Priority" NOT NULL DEFAULT 'STANDARD',
    "branchId" TEXT,
    "originHubId" TEXT,
    "currentHubId" TEXT,
    "driverId" TEXT,
    "vehicleId" TEXT,
    "driverAccepted" BOOLEAN NOT NULL DEFAULT false,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "proofRequirements" JSONB,
    "otpHash" TEXT,
    "otpExpiresAt" TIMESTAMP(3),
    "pickupScheduledAt" TIMESTAMP(3),
    "pickedUpAt" TIMESTAMP(3),
    "expectedDeliveryAt" TIMESTAMP(3),
    "rescheduledFor" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Shipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShipmentItem" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "weightKg" DECIMAL(10,2),
    "value" DECIMAL(14,2),

    CONSTRAINT "ShipmentItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShipmentEvent" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "status" "ShipmentStatus",
    "type" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "actorId" TEXT,
    "actorName" TEXT,
    "hubId" TEXT,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShipmentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryAttempt" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "driverId" TEXT,
    "attemptNo" INTEGER NOT NULL,
    "outcome" "AttemptOutcome" NOT NULL,
    "failureReason" "FailureReason",
    "resolution" "FailureResolution",
    "notes" TEXT,
    "rescheduledFor" TIMESTAMP(3),
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeliveryAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProofOfDelivery" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "driverId" TEXT,
    "recipientName" TEXT,
    "signatureData" TEXT,
    "photoUrl" TEXT,
    "otpVerified" BOOLEAN NOT NULL DEFAULT false,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clientEventId" TEXT,

    CONSTRAINT "ProofOfDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Driver" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT,
    "kind" "DriverKind" NOT NULL DEFAULT 'DRIVER',
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "branchId" TEXT,
    "licenseNumber" TEXT,
    "licenseExpiry" TIMESTAMP(3),
    "status" "DriverStatus" NOT NULL DEFAULT 'OFFLINE',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "payModel" "PayModel" NOT NULL DEFAULT 'PER_DELIVERY',
    "payRates" JSONB NOT NULL DEFAULT '{}',
    "vehicleId" TEXT,
    "currentLat" DOUBLE PRECISION,
    "currentLng" DOUBLE PRECISION,
    "lastLocationAt" TIMESTAMP(3),
    "rating" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Driver_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DriverLocation" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "speedKmh" DOUBLE PRECISION,
    "heading" DOUBLE PRECISION,
    "accuracyM" DOUBLE PRECISION,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DriverLocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vehicle" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "registrationNumber" TEXT NOT NULL,
    "type" "VehicleType" NOT NULL DEFAULT 'MOTORCYCLE',
    "make" TEXT,
    "model" TEXT,
    "year" INTEGER,
    "status" "VehicleStatus" NOT NULL DEFAULT 'AVAILABLE',
    "capacityKg" DECIMAL(10,2),
    "mileageKm" INTEGER NOT NULL DEFAULT 0,
    "insuranceExpiry" TIMESTAMP(3),
    "inspectionExpiry" TIMESTAMP(3),
    "roadworthinessExpiry" TIMESTAMP(3),
    "nextServiceAt" TIMESTAMP(3),
    "nextServiceKm" INTEGER,
    "fuelType" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Vehicle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaintenanceRecord" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "type" "MaintenanceType" NOT NULL,
    "description" TEXT,
    "cost" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "mileageKm" INTEGER,
    "performedAt" TIMESTAMP(3) NOT NULL,
    "nextDueAt" TIMESTAMP(3),
    "nextDueKm" INTEGER,
    "vendor" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MaintenanceRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Route" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "RouteStatus" NOT NULL DEFAULT 'PLANNED',
    "driverId" TEXT,
    "vehicleId" TEXT,
    "branchId" TEXT,
    "plannedDate" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "estDistanceKm" DOUBLE PRECISION,
    "estDurationMin" INTEGER,
    "optimizedBy" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Route_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RouteStop" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "routeId" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "type" "StopType" NOT NULL DEFAULT 'DELIVERY',
    "sequence" INTEGER NOT NULL,
    "status" "StopStatus" NOT NULL DEFAULT 'PENDING',
    "etaAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "RouteStop_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PricingRule" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "originZoneId" TEXT,
    "destinationZoneId" TEXT,
    "minWeightKg" DECIMAL(10,2),
    "maxWeightKg" DECIMAL(10,2),
    "minDistanceKm" DOUBLE PRECISION,
    "maxDistanceKm" DOUBLE PRECISION,
    "vehicleType" "VehicleType",
    "shipmentPriority" "Priority",
    "packageType" "PackageType",
    "customerType" "CustomerType",
    "corporateAccountId" TEXT,
    "interstate" BOOLEAN,
    "baseFee" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "perKgFee" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "includedKg" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "perKmFee" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "insurancePercent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "codFeePercent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "priorityMultiplier" DECIMAL(5,2) NOT NULL DEFAULT 1,
    "minimumFee" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PricingRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CodTransaction" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "driverId" TEXT,
    "customerId" TEXT,
    "amountDue" DECIMAL(14,2) NOT NULL,
    "amountCollected" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "amountRemitted" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "amountSettled" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "status" "CodStatus" NOT NULL DEFAULT 'PENDING',
    "collectedAt" TIMESTAMP(3),
    "remittedAt" TIMESTAMP(3),
    "settledAt" TIMESTAMP(3),
    "settlementReference" TEXT,
    "disputeNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CodTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "issueDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueDate" TIMESTAMP(3),
    "periodStart" TIMESTAMP(3),
    "periodEnd" TIMESTAMP(3),
    "subtotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "taxAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "amountPaid" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceLine" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "shipmentId" TEXT,
    "description" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitPrice" DECIMAL(14,2) NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "InvoiceLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditNote" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "invoiceId" TEXT,
    "customerId" TEXT,
    "amount" DECIMAL(14,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreditNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "customerId" TEXT,
    "invoiceId" TEXT,
    "shipmentId" TEXT,
    "amount" DECIMAL(14,2) NOT NULL,
    "method" "PaymentMethod" NOT NULL DEFAULT 'CASH',
    "status" "PaymentStatus" NOT NULL DEFAULT 'SUCCESSFUL',
    "reference" TEXT,
    "note" TEXT,
    "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recordedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Expense" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "category" "ExpenseCategory" NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "description" TEXT,
    "incurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "branchId" TEXT,
    "vehicleId" TEXT,
    "driverId" TEXT,
    "receiptUrl" TEXT,
    "recordedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Expense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Settlement" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "payModel" "PayModel" NOT NULL,
    "deliveriesCount" INTEGER NOT NULL DEFAULT 0,
    "earnings" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "bonuses" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "deductions" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "codCollected" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "codRemitted" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "expensesReimbursed" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "netPayable" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "status" "SettlementStatus" NOT NULL DEFAULT 'DRAFT',
    "paidAt" TIMESTAMP(3),
    "reference" TEXT,
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Settlement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryItem" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "hubId" TEXT,
    "name" TEXT NOT NULL,
    "sku" TEXT,
    "unit" TEXT NOT NULL DEFAULT 'pcs',
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "reorderLevel" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryMovement" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "type" "InventoryMovementType" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "note" TEXT,
    "actorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "category" "NotificationCategory" NOT NULL,
    "priority" "NotificationPriority" NOT NULL DEFAULT 'MEDIUM',
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "actionUrl" TEXT,
    "dedupeKey" TEXT,
    "isAiGenerated" BOOLEAN NOT NULL DEFAULT false,
    "readAt" TIMESTAMP(3),
    "dismissedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationDelivery" (
    "id" TEXT NOT NULL,
    "notificationId" TEXT NOT NULL,
    "channel" "Channel" NOT NULL,
    "state" "DeliveryState" NOT NULL DEFAULT 'PENDING',
    "error" TEXT,
    "sentAt" TIMESTAMP(3),

    CONSTRAINT "NotificationDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationPreference" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "category" "NotificationCategory" NOT NULL,
    "channels" "Channel"[],
    "muted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessageTemplate" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "channel" "Channel" NOT NULL,
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MessageTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "ownerType" "DocumentOwnerType" NOT NULL,
    "ownerId" TEXT,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "fileUrl" TEXT,
    "fileName" TEXT,
    "mimeType" TEXT,
    "sizeBytes" INTEGER,
    "issueDate" TIMESTAMP(3),
    "expiryDate" TIMESTAMP(3),
    "status" "DocumentStatus" NOT NULL DEFAULT 'VALID',
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportTicket" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" "TicketCategory" NOT NULL DEFAULT 'OTHER',
    "status" "TicketStatus" NOT NULL DEFAULT 'OPEN',
    "priority" "NotificationPriority" NOT NULL DEFAULT 'MEDIUM',
    "customerId" TEXT,
    "shipmentId" TEXT,
    "assigneeId" TEXT,
    "createdById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupportTicket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketComment" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "authorId" TEXT,
    "authorName" TEXT,
    "body" TEXT NOT NULL,
    "isInternal" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TicketComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "companyId" TEXT,
    "actorId" TEXT,
    "actorName" TEXT,
    "actorRole" TEXT,
    "action" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT,
    "before" JSONB,
    "after" JSONB,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIConversation" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AIConversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIMessage" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "role" "AiRole" NOT NULL,
    "content" TEXT NOT NULL,
    "toolCalls" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AIMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiKey" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "scopes" TEXT[],
    "customerId" TEXT,
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApiKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookEndpoint" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "secret" TEXT NOT NULL,
    "events" TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookEndpoint_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Company_slug_key" ON "Company"("slug");

-- CreateIndex
CREATE INDEX "Company_status_idx" ON "Company"("status");

-- CreateIndex
CREATE UNIQUE INDEX "CompanySettings_companyId_key" ON "CompanySettings"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_companyId_role_idx" ON "User"("companyId", "role");

-- CreateIndex
CREATE INDEX "User_companyId_isActive_idx" ON "User"("companyId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "StaffProfile_userId_key" ON "StaffProfile"("userId");

-- CreateIndex
CREATE INDEX "StaffProfile_companyId_idx" ON "StaffProfile"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "SubscriptionPlan_key_key" ON "SubscriptionPlan"("key");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_companyId_key" ON "Subscription"("companyId");

-- CreateIndex
CREATE INDEX "Subscription_status_idx" ON "Subscription"("status");

-- CreateIndex
CREATE INDEX "Subscription_currentPeriodEnd_idx" ON "Subscription"("currentPeriodEnd");

-- CreateIndex
CREATE UNIQUE INDEX "BillingPayment_reference_key" ON "BillingPayment"("reference");

-- CreateIndex
CREATE INDEX "BillingPayment_companyId_createdAt_idx" ON "BillingPayment"("companyId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "WebhookEvent_provider_eventId_key" ON "WebhookEvent"("provider", "eventId");

-- CreateIndex
CREATE INDEX "Branch_companyId_isActive_idx" ON "Branch"("companyId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "Branch_companyId_code_key" ON "Branch"("companyId", "code");

-- CreateIndex
CREATE INDEX "Hub_companyId_branchId_idx" ON "Hub"("companyId", "branchId");

-- CreateIndex
CREATE UNIQUE INDEX "Hub_companyId_code_key" ON "Hub"("companyId", "code");

-- CreateIndex
CREATE INDEX "Zone_companyId_idx" ON "Zone"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "Zone_companyId_code_key" ON "Zone"("companyId", "code");

-- CreateIndex
CREATE INDEX "Customer_companyId_type_idx" ON "Customer"("companyId", "type");

-- CreateIndex
CREATE INDEX "Customer_companyId_phone_idx" ON "Customer"("companyId", "phone");

-- CreateIndex
CREATE INDEX "Customer_companyId_name_idx" ON "Customer"("companyId", "name");

-- CreateIndex
CREATE INDEX "Customer_companyId_createdAt_idx" ON "Customer"("companyId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CorporateAccount_customerId_key" ON "CorporateAccount"("customerId");

-- CreateIndex
CREATE INDEX "CorporateAccount_companyId_idx" ON "CorporateAccount"("companyId");

-- CreateIndex
CREATE INDEX "Address_companyId_customerId_idx" ON "Address"("companyId", "customerId");

-- CreateIndex
CREATE UNIQUE INDEX "Shipment_trackingNumber_key" ON "Shipment"("trackingNumber");

-- CreateIndex
CREATE INDEX "Shipment_companyId_status_idx" ON "Shipment"("companyId", "status");

-- CreateIndex
CREATE INDEX "Shipment_companyId_createdAt_idx" ON "Shipment"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "Shipment_companyId_driverId_status_idx" ON "Shipment"("companyId", "driverId", "status");

-- CreateIndex
CREATE INDEX "Shipment_companyId_vehicleId_idx" ON "Shipment"("companyId", "vehicleId");

-- CreateIndex
CREATE INDEX "Shipment_companyId_customerId_idx" ON "Shipment"("companyId", "customerId");

-- CreateIndex
CREATE INDEX "Shipment_companyId_branchId_status_idx" ON "Shipment"("companyId", "branchId", "status");

-- CreateIndex
CREATE INDEX "Shipment_companyId_currentHubId_idx" ON "Shipment"("companyId", "currentHubId");

-- CreateIndex
CREATE INDEX "Shipment_companyId_deliveryZoneId_idx" ON "Shipment"("companyId", "deliveryZoneId");

-- CreateIndex
CREATE INDEX "Shipment_companyId_recipientPhone_idx" ON "Shipment"("companyId", "recipientPhone");

-- CreateIndex
CREATE INDEX "Shipment_companyId_expectedDeliveryAt_idx" ON "Shipment"("companyId", "expectedDeliveryAt");

-- CreateIndex
CREATE UNIQUE INDEX "Shipment_companyId_orderNumber_key" ON "Shipment"("companyId", "orderNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Shipment_companyId_idempotencyKey_key" ON "Shipment"("companyId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "ShipmentItem_companyId_shipmentId_idx" ON "ShipmentItem"("companyId", "shipmentId");

-- CreateIndex
CREATE INDEX "ShipmentEvent_companyId_shipmentId_createdAt_idx" ON "ShipmentEvent"("companyId", "shipmentId", "createdAt");

-- CreateIndex
CREATE INDEX "ShipmentEvent_companyId_createdAt_idx" ON "ShipmentEvent"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "DeliveryAttempt_companyId_shipmentId_idx" ON "DeliveryAttempt"("companyId", "shipmentId");

-- CreateIndex
CREATE INDEX "DeliveryAttempt_companyId_driverId_createdAt_idx" ON "DeliveryAttempt"("companyId", "driverId", "createdAt");

-- CreateIndex
CREATE INDEX "DeliveryAttempt_companyId_failureReason_createdAt_idx" ON "DeliveryAttempt"("companyId", "failureReason", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ProofOfDelivery_shipmentId_key" ON "ProofOfDelivery"("shipmentId");

-- CreateIndex
CREATE INDEX "ProofOfDelivery_companyId_idx" ON "ProofOfDelivery"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "Driver_userId_key" ON "Driver"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Driver_vehicleId_key" ON "Driver"("vehicleId");

-- CreateIndex
CREATE INDEX "Driver_companyId_status_idx" ON "Driver"("companyId", "status");

-- CreateIndex
CREATE INDEX "Driver_companyId_branchId_idx" ON "Driver"("companyId", "branchId");

-- CreateIndex
CREATE INDEX "Driver_companyId_isActive_idx" ON "Driver"("companyId", "isActive");

-- CreateIndex
CREATE INDEX "DriverLocation_companyId_driverId_recordedAt_idx" ON "DriverLocation"("companyId", "driverId", "recordedAt");

-- CreateIndex
CREATE INDEX "Vehicle_companyId_status_idx" ON "Vehicle"("companyId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Vehicle_companyId_registrationNumber_key" ON "Vehicle"("companyId", "registrationNumber");

-- CreateIndex
CREATE INDEX "MaintenanceRecord_companyId_vehicleId_performedAt_idx" ON "MaintenanceRecord"("companyId", "vehicleId", "performedAt");

-- CreateIndex
CREATE INDEX "Route_companyId_status_idx" ON "Route"("companyId", "status");

-- CreateIndex
CREATE INDEX "Route_companyId_driverId_plannedDate_idx" ON "Route"("companyId", "driverId", "plannedDate");

-- CreateIndex
CREATE INDEX "RouteStop_companyId_routeId_sequence_idx" ON "RouteStop"("companyId", "routeId", "sequence");

-- CreateIndex
CREATE INDEX "RouteStop_companyId_shipmentId_idx" ON "RouteStop"("companyId", "shipmentId");

-- CreateIndex
CREATE UNIQUE INDEX "RouteStop_routeId_shipmentId_type_key" ON "RouteStop"("routeId", "shipmentId", "type");

-- CreateIndex
CREATE INDEX "PricingRule_companyId_isActive_priority_idx" ON "PricingRule"("companyId", "isActive", "priority");

-- CreateIndex
CREATE UNIQUE INDEX "CodTransaction_shipmentId_key" ON "CodTransaction"("shipmentId");

-- CreateIndex
CREATE INDEX "CodTransaction_companyId_status_idx" ON "CodTransaction"("companyId", "status");

-- CreateIndex
CREATE INDEX "CodTransaction_companyId_driverId_status_idx" ON "CodTransaction"("companyId", "driverId", "status");

-- CreateIndex
CREATE INDEX "CodTransaction_companyId_customerId_status_idx" ON "CodTransaction"("companyId", "customerId", "status");

-- CreateIndex
CREATE INDEX "Invoice_companyId_status_idx" ON "Invoice"("companyId", "status");

-- CreateIndex
CREATE INDEX "Invoice_companyId_customerId_idx" ON "Invoice"("companyId", "customerId");

-- CreateIndex
CREATE INDEX "Invoice_companyId_createdAt_idx" ON "Invoice"("companyId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_companyId_number_key" ON "Invoice"("companyId", "number");

-- CreateIndex
CREATE INDEX "InvoiceLine_companyId_invoiceId_idx" ON "InvoiceLine"("companyId", "invoiceId");

-- CreateIndex
CREATE INDEX "InvoiceLine_companyId_shipmentId_idx" ON "InvoiceLine"("companyId", "shipmentId");

-- CreateIndex
CREATE INDEX "CreditNote_companyId_createdAt_idx" ON "CreditNote"("companyId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CreditNote_companyId_number_key" ON "CreditNote"("companyId", "number");

-- CreateIndex
CREATE INDEX "Payment_companyId_paidAt_idx" ON "Payment"("companyId", "paidAt");

-- CreateIndex
CREATE INDEX "Payment_companyId_customerId_idx" ON "Payment"("companyId", "customerId");

-- CreateIndex
CREATE INDEX "Payment_companyId_invoiceId_idx" ON "Payment"("companyId", "invoiceId");

-- CreateIndex
CREATE INDEX "Payment_companyId_shipmentId_idx" ON "Payment"("companyId", "shipmentId");

-- CreateIndex
CREATE INDEX "Expense_companyId_incurredAt_idx" ON "Expense"("companyId", "incurredAt");

-- CreateIndex
CREATE INDEX "Expense_companyId_category_idx" ON "Expense"("companyId", "category");

-- CreateIndex
CREATE INDEX "Expense_companyId_branchId_idx" ON "Expense"("companyId", "branchId");

-- CreateIndex
CREATE INDEX "Settlement_companyId_driverId_periodEnd_idx" ON "Settlement"("companyId", "driverId", "periodEnd");

-- CreateIndex
CREATE INDEX "Settlement_companyId_status_idx" ON "Settlement"("companyId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Settlement_companyId_number_key" ON "Settlement"("companyId", "number");

-- CreateIndex
CREATE INDEX "InventoryItem_companyId_hubId_idx" ON "InventoryItem"("companyId", "hubId");

-- CreateIndex
CREATE INDEX "InventoryMovement_companyId_itemId_createdAt_idx" ON "InventoryMovement"("companyId", "itemId", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_companyId_userId_readAt_createdAt_idx" ON "Notification"("companyId", "userId", "readAt", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_userId_dedupeKey_createdAt_idx" ON "Notification"("userId", "dedupeKey", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_companyId_category_idx" ON "Notification"("companyId", "category");

-- CreateIndex
CREATE INDEX "NotificationDelivery_notificationId_idx" ON "NotificationDelivery"("notificationId");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationPreference_userId_category_key" ON "NotificationPreference"("userId", "category");

-- CreateIndex
CREATE UNIQUE INDEX "MessageTemplate_companyId_event_channel_key" ON "MessageTemplate"("companyId", "event", "channel");

-- CreateIndex
CREATE INDEX "Document_companyId_ownerType_ownerId_idx" ON "Document"("companyId", "ownerType", "ownerId");

-- CreateIndex
CREATE INDEX "Document_companyId_expiryDate_idx" ON "Document"("companyId", "expiryDate");

-- CreateIndex
CREATE INDEX "SupportTicket_companyId_status_idx" ON "SupportTicket"("companyId", "status");

-- CreateIndex
CREATE INDEX "SupportTicket_companyId_assigneeId_idx" ON "SupportTicket"("companyId", "assigneeId");

-- CreateIndex
CREATE UNIQUE INDEX "SupportTicket_companyId_number_key" ON "SupportTicket"("companyId", "number");

-- CreateIndex
CREATE INDEX "TicketComment_companyId_ticketId_idx" ON "TicketComment"("companyId", "ticketId");

-- CreateIndex
CREATE INDEX "AuditLog_companyId_createdAt_idx" ON "AuditLog"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_companyId_resourceType_resourceId_idx" ON "AuditLog"("companyId", "resourceType", "resourceId");

-- CreateIndex
CREATE INDEX "AuditLog_companyId_actorId_idx" ON "AuditLog"("companyId", "actorId");

-- CreateIndex
CREATE INDEX "AIConversation_companyId_userId_updatedAt_idx" ON "AIConversation"("companyId", "userId", "updatedAt");

-- CreateIndex
CREATE INDEX "AIMessage_companyId_conversationId_createdAt_idx" ON "AIMessage"("companyId", "conversationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ApiKey_keyHash_key" ON "ApiKey"("keyHash");

-- CreateIndex
CREATE INDEX "ApiKey_companyId_idx" ON "ApiKey"("companyId");

-- CreateIndex
CREATE INDEX "WebhookEndpoint_companyId_idx" ON "WebhookEndpoint"("companyId");

-- AddForeignKey
ALTER TABLE "CompanySettings" ADD CONSTRAINT "CompanySettings_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffProfile" ADD CONSTRAINT "StaffProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_planId_fkey" FOREIGN KEY ("planId") REFERENCES "SubscriptionPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingPayment" ADD CONSTRAINT "BillingPayment_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Hub" ADD CONSTRAINT "Hub_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CorporateAccount" ADD CONSTRAINT "CorporateAccount_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Address" ADD CONSTRAINT "Address_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_originHubId_fkey" FOREIGN KEY ("originHubId") REFERENCES "Hub"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_currentHubId_fkey" FOREIGN KEY ("currentHubId") REFERENCES "Hub"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipmentItem" ADD CONSTRAINT "ShipmentItem_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipmentEvent" ADD CONSTRAINT "ShipmentEvent_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipmentEvent" ADD CONSTRAINT "ShipmentEvent_hubId_fkey" FOREIGN KEY ("hubId") REFERENCES "Hub"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryAttempt" ADD CONSTRAINT "DeliveryAttempt_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryAttempt" ADD CONSTRAINT "DeliveryAttempt_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProofOfDelivery" ADD CONSTRAINT "ProofOfDelivery_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Driver" ADD CONSTRAINT "Driver_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Driver" ADD CONSTRAINT "Driver_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Driver" ADD CONSTRAINT "Driver_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DriverLocation" ADD CONSTRAINT "DriverLocation_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceRecord" ADD CONSTRAINT "MaintenanceRecord_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Route" ADD CONSTRAINT "Route_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Route" ADD CONSTRAINT "Route_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RouteStop" ADD CONSTRAINT "RouteStop_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "Route"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RouteStop" ADD CONSTRAINT "RouteStop_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CodTransaction" ADD CONSTRAINT "CodTransaction_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CodTransaction" ADD CONSTRAINT "CodTransaction_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditNote" ADD CONSTRAINT "CreditNote_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Settlement" ADD CONSTRAINT "Settlement_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "InventoryItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationDelivery" ADD CONSTRAINT "NotificationDelivery_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "Notification"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketComment" ADD CONSTRAINT "TicketComment_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "SupportTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIMessage" ADD CONSTRAINT "AIMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "AIConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
