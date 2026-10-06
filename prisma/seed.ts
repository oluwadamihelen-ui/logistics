/* Demo data: a fictional company, "SwiftDrop Logistics". All people/phones are invented. */
import bcrypt from "bcryptjs";
import type { Prisma, ShipmentStatus } from "@prisma/client";
import { prisma, createTenantClient, nextSequence } from "../src/lib/platform/db";
import { ensurePlans, BCRYPT_ROUNDS } from "../src/lib/platform/provisioning";
import { generateTrackingNumber, formatOrderNumber } from "../src/lib/logistics/tracking";
import { computeQuote } from "../src/lib/logistics/pricing";
import { loadPricingRules, createShipment, transitionShipment, assignShipments } from "../src/lib/logistics/shipments";
import { emit } from "../src/lib/platform/notifications/engine";

const PASSWORD = process.env.SEED_PASSWORD ?? "SwiftDrop#2026";
let s = 42;
const rnd = () => { s |= 0; s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const pick = <T,>(a: readonly T[]) => a[Math.floor(rnd() * a.length)];
const between = (a: number, b: number) => a + Math.floor(rnd() * (b - a + 1));
const hoursAgo = (h: number) => new Date(Date.now() - h * 3600_000);
const phone = () => `080${between(10000000, 99999999)}`;

async function main() {
  await ensurePlans();
  const hash = await bcrypt.hash(PASSWORD, BCRYPT_ROUNDS);
  const proPlan = await prisma.subscriptionPlan.findUniqueOrThrow({ where: { key: "premium" } });

  await prisma.user.upsert({ where: { email: "admin@platform.test" }, update: {}, create: { email: "admin@platform.test", passwordHash: hash, name: "Platform Admin", role: "PLATFORM_SUPER_ADMIN" } });

  if (await prisma.company.findUnique({ where: { slug: "swiftdrop" } })) { console.log("Seed already applied (company 'swiftdrop' exists)."); return; }

  const company = await prisma.company.create({
    data: {
      name: "SwiftDrop Logistics", slug: "swiftdrop", status: "ACTIVE", onboardedAt: new Date(), onboardingStep: 6, businessType: "Last-mile delivery",
      email: "ops@swiftdrop.test", phone: "08000000001", addressLine: "14 Obafemi Awolowo Way", city: "Ikeja", state: "Lagos", operatingRegions: ["Lagos", "Abuja"],
      settings: { create: { shipmentPrefix: "SD", trackingPrefix: "SD", enabledChannels: ["IN_APP", "EMAIL"], highValueThreshold: 150000 } },
      subscription: { create: { planId: proPlan.id, status: "ACTIVE", interval: "MONTHLY", currentPeriodStart: hoursAgo(24 * 10), currentPeriodEnd: new Date(Date.now() + 20 * 86400_000) } },
    },
  });
  const cid = company.id;
  const db = createTenantClient(cid);
  const mk = async (name: string, email: string, role: any, extra: Record<string, unknown> = {}) =>
    prisma.user.create({ data: { name, email, passwordHash: hash, role, companyId: cid, ...extra } });

  const owner = await mk("Tunde Adebayo", "owner@swiftdrop.test", "COMPANY_OWNER");
  const svc = { db, companyId: cid, actor: { id: owner.id, name: owner.name, role: "COMPANY_OWNER" } };

  const [ikeja, lekki, abuja] = await Promise.all([
    db.branch.create({ data: { name: "Ikeja Branch", code: "IKJ", city: "Ikeja", state: "Lagos", lat: 6.6018, lng: 3.3515 } as any }),
    db.branch.create({ data: { name: "Lekki Branch", code: "LEK", city: "Lekki", state: "Lagos", lat: 6.4474, lng: 3.4723 } as any }),
    db.branch.create({ data: { name: "Abuja Branch", code: "ABJ", city: "Abuja", state: "FCT", lat: 9.0765, lng: 7.3986 } as any }),
  ]);
  const hubs = await Promise.all([
    db.hub.create({ data: { name: "Ikeja Sorting Hub", code: "IKJ-H", type: "SORTING_CENTER", branchId: ikeja.id, city: "Ikeja", state: "Lagos", lat: 6.605, lng: 3.34 } as any }),
    db.hub.create({ data: { name: "Lekki Hub", code: "LEK-H", type: "HUB", branchId: lekki.id, city: "Lekki", state: "Lagos", lat: 6.44, lng: 3.5 } as any }),
    db.hub.create({ data: { name: "Abuja Warehouse", code: "ABJ-W", type: "WAREHOUSE", branchId: abuja.id, city: "Abuja", state: "FCT", lat: 9.06, lng: 7.49 } as any }),
  ]);
  const zones = await Promise.all([
    db.zone.create({ data: { name: "Lagos Mainland", code: "LM", areas: ["Ikeja", "Yaba", "Surulere", "Maryland", "Ikorodu"] } as any }),
    db.zone.create({ data: { name: "Lagos Island", code: "LI", areas: ["Lekki", "Victoria Island", "Ikoyi", "Ajah"] } as any }),
    db.zone.create({ data: { name: "Abuja Central", code: "AC", areas: ["Abuja", "Wuse", "Garki", "Maitama", "FCT"] } as any }),
  ]);
  await db.pricingRule.createMany({ data: [
    { name: "Mainland → Mainland (≤5kg)", priority: 10, originZoneId: zones[0].id, destinationZoneId: zones[0].id, baseFee: 1800, perKgFee: 150, includedKg: 5, codFeePercent: 1.5, minimumFee: 1800 },
    { name: "Mainland ↔ Island (≤5kg)", priority: 20, originZoneId: zones[0].id, destinationZoneId: zones[1].id, baseFee: 2800, perKgFee: 200, includedKg: 5, codFeePercent: 1.5, minimumFee: 2800 },
    { name: "Island → Island", priority: 30, originZoneId: zones[1].id, destinationZoneId: zones[1].id, baseFee: 2200, perKgFee: 180, includedKg: 5, codFeePercent: 1.5, minimumFee: 2200 },
    { name: "Express uplift (any)", priority: 80, shipmentPriority: "EXPRESS", baseFee: 3500, perKgFee: 250, includedKg: 3, priorityMultiplier: 1.3, minimumFee: 3500 },
    { name: "Interstate", priority: 90, interstate: true, baseFee: 6500, perKgFee: 400, includedKg: 2, insurancePercent: 1, minimumFee: 6500 },
    { name: "Standard fallback", priority: 100, baseFee: 2500, perKgFee: 180, includedKg: 5, minimumFee: 2500 },
  ] as any });

  const staff: [string, string, any, Record<string, unknown>?][] = [
    ["Ngozi Eze", "ops@swiftdrop.test", "OPERATIONS_MANAGER"], ["Ibrahim Musa", "dispatch@swiftdrop.test", "DISPATCH_MANAGER"],
    ["Kemi Ojo", "dispatcher@swiftdrop.test", "DISPATCHER"], ["Chidi Okafor", "fleet@swiftdrop.test", "FLEET_MANAGER"],
    ["Amaka Obi", "finance@swiftdrop.test", "ACCOUNTANT"], ["Sade Bello", "support@swiftdrop.test", "CUSTOMER_SERVICE"],
    ["Yusuf Lawal", "branch.lekki@swiftdrop.test", "BRANCH_MANAGER", { branchId: lekki.id }], ["Funke Ade", "hr@swiftdrop.test", "HR_ADMIN"],
  ];
  for (const [n, e, r, x] of staff) await mk(n, e, r, x ?? {});

  // Fleet + drivers
  const vtypes = ["MOTORCYCLE", "MOTORCYCLE", "MOTORCYCLE", "MOTORCYCLE", "VAN", "VAN", "CAR", "TRUCK"] as const;
  const vehicles: Awaited<ReturnType<typeof db.vehicle.create>>[] = [];
  for (let i = 0; i < vtypes.length; i++) {
    vehicles.push(await db.vehicle.create({ data: {
      registrationNumber: `${pick(["LSD", "KJA", "APP", "EKY"])}-${between(100, 999)}${pick(["AA", "XY", "BC"])}`, type: vtypes[i],
      make: pick(["Honda", "Bajaj", "Toyota", "Ford", "Mack"]), model: pick(["CG125", "Boxer", "Hiace", "Transit", "Ranger"]), year: between(2017, 2024),
      mileageKm: between(8000, 90000), status: i === 7 ? "MAINTENANCE" : "AVAILABLE",
      insuranceExpiry: new Date(Date.now() + (i === 2 ? 6 : i === 5 ? -3 : between(40, 300)) * 86400_000),
      inspectionExpiry: new Date(Date.now() + between(20, 250) * 86400_000), roadworthinessExpiry: new Date(Date.now() + between(60, 300) * 86400_000),
      nextServiceKm: between(90000, 99000), capacityKg: vtypes[i] === "TRUCK" ? 3000 : vtypes[i] === "VAN" ? 900 : 30,
    } as any }));
  }
  await db.maintenanceRecord.createMany({ data: vehicles.slice(0, 5).map((v, i) => ({ vehicleId: v.id, type: pick(["SERVICE", "OIL_CHANGE", "TYRES", "REPAIR"]), cost: between(8, 120) * 1000, performedAt: hoursAgo(24 * between(10, 90)), mileageKm: between(8000, 80000), description: "Routine maintenance", vendor: "Prime Auto Care" })) as any });
  const dn = ["Segun Balogun", "Emeka Nwosu", "Aliyu Garba", "Tobi Ajayi", "Femi Coker", "Bisi Adeleke", "Dayo Ogunleye", "Musa Danjuma"];
  const drivers: Awaited<ReturnType<typeof db.driver.create>>[] = [];
  for (let i = 0; i < dn.length; i++) {
    const u = await mk(dn[i], `driver${i + 1}@swiftdrop.test`, i % 3 === 2 ? "RIDER" : "DRIVER", { branchId: [ikeja, lekki, abuja][i % 3].id, phone: phone() });
    drivers.push(await db.driver.create({ data: {
      userId: u.id, name: dn[i], phone: u.phone!, kind: i % 3 === 2 ? "RIDER" : "DRIVER", branchId: [ikeja, lekki, abuja][i % 3].id, vehicleId: vehicles[i].id,
      licenseNumber: `LIC${between(100000, 999999)}`, licenseExpiry: new Date(Date.now() + between(-5, 500) * 86400_000), status: i === 7 ? "OFFLINE" : "AVAILABLE",
      payModel: pick(["PER_DELIVERY", "PER_DELIVERY", "HYBRID", "PERCENTAGE"] as const), payRates: { perDelivery: 600, percentage: 20, salary: 40000 },
    } as any }));
  }

  // Customers
  const custDefs: [string, string, any, string?][] = [
    ["Adaeze Okoro", "individual", "INDIVIDUAL"], ["Kola Fashola", "individual", "INDIVIDUAL"], ["Mariam Sani", "individual", "INDIVIDUAL"],
    ["GreenLeaf Pharmacy", "pharmacy", "BUSINESS", "GreenLeaf Pharmacy Ltd"], ["Bukka Hut Foods", "food", "BUSINESS", "Bukka Hut Foods"],
    ["Zuri Fashion", "seller", "MARKETPLACE_SELLER", "Zuri Fashion"], ["TechNest Gadgets", "seller", "MARKETPLACE_SELLER", "TechNest Gadgets"],
    ["Meridian Bank Courier Desk", "corp", "CORPORATE", "Meridian Bank Plc"], ["Apex Legal Chambers", "corp", "CORPORATE", "Apex Legal Chambers"], ["Ola Ventures", "biz", "BUSINESS", "Ola Ventures"],
  ];
  const customers: Awaited<ReturnType<typeof db.customer.create>>[] = [];
  for (const [name, , type, biz] of custDefs) customers.push(await db.customer.create({ data: { name, type, phone: phone(), email: `${name.split(" ")[0].toLowerCase()}@example.test`, businessName: biz } as any }));
  for (const c of customers.filter((c) => c.type === "CORPORATE")) await db.corporateAccount.create({ data: { customerId: c.id, creditLimit: 2_000_000, paymentTermsDays: 30, discountPercent: 8, apiEnabled: true, accountManagerId: owner.id } as any });
  const corp0 = customers.find((c) => c.type === "CORPORATE")!;
  await prisma.user.create({ data: { email: "portal@meridian.test", name: "Meridian Courier Desk", passwordHash: hash, role: "CUSTOMER", companyId: cid, customerId: corp0.id } });
  const sellers = customers.filter((c) => c.type === "MARKETPLACE_SELLER");

  // Historical shipments (direct inserts with backdated timestamps)
  const rules = await loadPricingRules(svc);
  const cities: [string, string, number][] = [["Ikeja", "Lagos", 0], ["Yaba", "Lagos", 0], ["Surulere", "Lagos", 0], ["Lekki", "Lagos", 1], ["Victoria Island", "Lagos", 1], ["Ajah", "Lagos", 1], ["Wuse", "FCT", 2]];
  const reasons = ["CUSTOMER_UNAVAILABLE", "WRONG_ADDRESS", "PHONE_UNREACHABLE", "CUSTOMER_REFUSED", "BUSINESS_CLOSED"] as const;
  const first = ["Chioma", "Emmanuel", "Fatima", "Gbenga", "Hauwa", "Ifeanyi", "Jide", "Kehinde", "Lola", "Nkem", "Obinna", "Peju"];
  const last = ["Akpan", "Bakare", "Chukwu", "Dike", "Ekong", "Folarin", "Gana", "Hassan"];
  const streets = ["Allen Avenue", "Admiralty Way", "Herbert Macaulay Way", "Adeola Odeku St", "Awolowo Road", "Ahmadu Bello Way"];
  const prefix = "SD";
  const N = 220;
  const batch: Prisma.ShipmentCreateManyInput[] = [];
  const meta: { status: ShipmentStatus; created: Date; di: number; failedAttempts: number; cod: number }[] = [];
  for (let i = 0; i < N; i++) {
    const ageH = Math.floor(rnd() * 24 * 20) + (i < 40 ? 0 : 6);
    const created = hoursAgo(i < 40 ? rnd() * 20 : ageH);
    const roll = rnd();
    const age = (Date.now() - created.getTime()) / 3600_000;
    let status: ShipmentStatus;
    if (age < 3) status = pick(["CREATED", "CONFIRMED", "PICKUP_ASSIGNED"] as const);
    else if (age < 10) status = pick(["PICKED_UP", "AT_HUB", "READY_FOR_DISPATCH", "ASSIGNED_FOR_DELIVERY", "OUT_FOR_DELIVERY"] as const);
    else status = roll < 0.82 ? "DELIVERED" : roll < 0.9 ? "DELIVERY_FAILED" : roll < 0.95 ? "RETURNED_TO_SENDER" : roll < 0.97 ? "CANCELLED" : "RESCHEDULED";
    const [city, state, zi] = pick(cities);
    const [pc, ps, pzi] = pick(cities.slice(0, 6));
    const weight = Number((rnd() * 9 + 0.3).toFixed(1));
    const cod = rnd() < 0.4 ? between(5, 120) * 1000 : 0;
    const q = computeQuote(rules, { originZoneId: zones[pzi].id, destinationZoneId: zones[zi].id, weightKg: weight, priority: "STANDARD", packageType: "PARCEL", declaredValue: 0, codAmount: cod, interstate: ps !== state });
    const di = i % drivers.length;
    const seller = rnd() < 0.55 ? pick(sellers.concat(customers.slice(3, 5))) : pick(customers);
    const driverAssigned = !["CREATED", "CONFIRMED", "CANCELLED", "AT_HUB", "READY_FOR_DISPATCH", "RETURNED_TO_SENDER"].includes(status);
    const seq = await nextSequence(cid, "shipment");
    batch.push({
      companyId: cid, trackingNumber: generateTrackingNumber(prefix), orderNumber: formatOrderNumber(prefix, seq), source: "DASHBOARD", customerId: seller.id, status,
      senderName: seller.name.slice(0, 40), senderPhone: seller.phone, pickupAddress: `${between(1, 90)} ${pick(streets)}`, pickupCity: pc, pickupState: ps, pickupZoneId: zones[pzi].id,
      recipientName: `${pick(first)} ${pick(last)}`, recipientPhone: phone(), deliveryAddress: `${between(1, 120)} ${pick(streets)}`, deliveryCity: city, deliveryState: state, deliveryZoneId: zones[zi].id,
      deliveryLat: [6.6, 6.52, 6.5, 6.45, 6.43, 6.47, 9.07][cities.findIndex((c) => c[0] === city)] + (rnd() - 0.5) * 0.02, deliveryLng: [3.34, 3.38, 3.35, 3.47, 3.42, 3.57, 7.48][cities.findIndex((c) => c[0] === city)] + (rnd() - 0.5) * 0.02,
      packageDescription: pick(["Phone accessories", "Clothing parcel", "Prescription package", "Documents", "Hot meal order", "Laptop", "Skincare set", "Books"]),
      packageType: pick(["PARCEL", "DOCUMENT", "FOOD", "PHARMACY", "ELECTRONICS"] as const), weightKg: weight, declaredValue: cod ? cod : between(0, 3) * 20000, codAmount: cod,
      deliveryFee: q.total || 2500, priceBreakdown: q as any, paymentStatus: status === "DELIVERED" ? "PAID" : "UNPAID", priority: pick(["STANDARD", "STANDARD", "STANDARD", "EXPRESS"] as const),
      branchId: [ikeja, lekki, abuja][zi].id, currentHubId: ["AT_HUB", "READY_FOR_DISPATCH", "RETURNED_TO_HUB"].includes(status) ? hubs[zi].id : null,
      driverId: driverAssigned ? drivers[di].id : null, vehicleId: driverAssigned ? vehicles[di].id : null, driverAccepted: driverAssigned,
      attemptCount: status === "DELIVERED" ? (rnd() < 0.12 ? 2 : 1) : ["DELIVERY_FAILED", "RETURNED_TO_SENDER", "RESCHEDULED"].includes(status) ? between(1, 3) : 0,
      proofRequirements: { signature: false, photo: true, otp: false, gps: true, recipientName: true } as any,
      expectedDeliveryAt: new Date(created.getTime() + 48 * 3600_000), createdAt: created, createdById: owner.id,
      deliveredAt: status === "DELIVERED" ? new Date(created.getTime() + between(3, 40) * 3600_000) : null,
      pickedUpAt: ["CREATED", "CONFIRMED", "PICKUP_ASSIGNED", "CANCELLED"].includes(status) ? null : new Date(created.getTime() + 2 * 3600_000),
    });
    meta.push({ status, created, di, failedAttempts: status === "DELIVERED" ? 0 : ["DELIVERY_FAILED", "RETURNED_TO_SENDER", "RESCHEDULED"].includes(status) ? 1 : 0, cod });
  }
  // Fix deliveredAt to not be in the future
  for (const b of batch) if (b.deliveredAt && (b.deliveredAt as Date) > new Date()) b.deliveredAt = new Date();
  await prisma.shipment.createMany({ data: batch });
  const created = await prisma.shipment.findMany({ where: { companyId: cid }, select: { id: true, status: true, createdAt: true, codAmount: true, driverId: true, customerId: true, deliveredAt: true, trackingNumber: true } });

  const events: Prisma.ShipmentEventCreateManyInput[] = [];
  const attempts: Prisma.DeliveryAttemptCreateManyInput[] = [];
  const cods: Prisma.CodTransactionCreateManyInput[] = [];
  const proofs: Prisma.ProofOfDeliveryCreateManyInput[] = [];
  const path: ShipmentStatus[] = ["CREATED", "CONFIRMED", "PICKUP_ASSIGNED", "PICKED_UP", "AT_HUB", "READY_FOR_DISPATCH", "ASSIGNED_FOR_DELIVERY", "OUT_FOR_DELIVERY", "DELIVERED"];
  for (const sh of created) {
    const target = sh.status === "DELIVERED" ? "DELIVERED" : ["DELIVERY_FAILED", "RESCHEDULED", "RETURNED_TO_SENDER"].includes(sh.status) ? "OUT_FOR_DELIVERY" : sh.status;
    const upto = target === "CANCELLED" ? 0 : path.indexOf(target as ShipmentStatus);
    const label: Record<string, string> = { CREATED: "Shipment created", CONFIRMED: "Shipment confirmed", PICKUP_ASSIGNED: "Pickup assigned", PICKED_UP: "Picked up from sender", AT_HUB: "Arrived at hub", READY_FOR_DISPATCH: "Ready for dispatch", ASSIGNED_FOR_DELIVERY: "Assigned for delivery", OUT_FOR_DELIVERY: "Out for delivery", DELIVERED: "Delivered" };
    for (let k = 0; k <= Math.max(upto, 0); k++) events.push({ companyId: cid, shipmentId: sh.id, status: path[k], type: k === 0 ? "created" : "status", description: label[path[k]], actorName: "System", createdAt: new Date(sh.createdAt.getTime() + k * 45 * 60_000) });
    if (sh.status === "CANCELLED") events.push({ companyId: cid, shipmentId: sh.id, status: "CANCELLED", type: "status", description: "Shipment cancelled", actorName: "System", createdAt: new Date(sh.createdAt.getTime() + 3600_000) });
    const at = new Date(sh.createdAt.getTime() + 8 * 45 * 60_000);
    if (sh.status === "DELIVERED") {
      attempts.push({ companyId: cid, shipmentId: sh.id, driverId: sh.driverId, attemptNo: 1, outcome: "DELIVERED", createdAt: sh.deliveredAt ?? at });
      proofs.push({ companyId: cid, shipmentId: sh.id, driverId: sh.driverId, recipientName: "Recipient", photoUrl: null, lat: 6.45, lng: 3.4, capturedAt: sh.deliveredAt ?? at });
    }
    if (["DELIVERY_FAILED", "RESCHEDULED", "RETURNED_TO_SENDER"].includes(sh.status)) {
      const reason = pick(reasons);
      attempts.push({ companyId: cid, shipmentId: sh.id, driverId: sh.driverId, attemptNo: 1, outcome: "FAILED", failureReason: reason, resolution: sh.status === "RESCHEDULED" ? "RESCHEDULED" : sh.status === "RETURNED_TO_SENDER" ? "RETURN_TO_SENDER" : "PENDING", createdAt: at });
      events.push({ companyId: cid, shipmentId: sh.id, status: "DELIVERY_FAILED", type: "delivery_failed", description: `Delivery attempt 1 failed: ${reason.replace(/_/g, " ").toLowerCase()}`, actorName: "System", createdAt: at });
      if (sh.status === "RETURNED_TO_SENDER") events.push({ companyId: cid, shipmentId: sh.id, status: "RETURNED_TO_SENDER", type: "status", description: "Returned to sender", actorName: "System", createdAt: new Date(at.getTime() + 20 * 3600_000) });
    }
    const cod = Number(sh.codAmount);
    if (cod > 0 && sh.status !== "CANCELLED") {
      const delivered = sh.status === "DELIVERED";
      const age = delivered ? (Date.now() - (sh.deliveredAt ?? at).getTime()) / 86400_000 : 0;
      const mismatch = delivered && rnd() < 0.05;
      const collected = delivered ? (mismatch ? cod - 2000 : cod) : 0;
      const remitted = delivered && age > 1 && rnd() < 0.7 ? collected : 0;
      const settled = remitted && age > 3 && rnd() < 0.6 ? collected : 0;
      cods.push({ companyId: cid, shipmentId: sh.id, driverId: sh.driverId, customerId: sh.customerId, amountDue: cod, amountCollected: collected, amountRemitted: remitted, amountSettled: settled,
        status: mismatch ? "DISPUTED" : settled ? "SETTLED" : collected ? "COLLECTED" : "PENDING", collectedAt: delivered ? sh.deliveredAt : null, remittedAt: remitted ? sh.deliveredAt : null, settledAt: settled ? sh.deliveredAt : null, settlementReference: settled ? `SET-${sh.trackingNumber.slice(-5)}` : null, disputeNote: mismatch ? `Collected ${collected} but ${cod} was due` : null });
    }
  }
  await prisma.shipmentEvent.createMany({ data: events });
  await prisma.deliveryAttempt.createMany({ data: attempts });
  await prisma.proofOfDelivery.createMany({ data: proofs });
  await prisma.codTransaction.createMany({ data: cods });

  // Finance
  const invCust = customers.filter((c) => c.type === "CORPORATE");
  for (const [i, c] of invCust.entries()) {
    const ships = created.filter((x) => x.customerId === c.id && x.status === "DELIVERED").slice(0, 8);
    const rows = ships.length ? ships : created.filter((x) => x.status === "DELIVERED").slice(0, 6);
    const lines = await prisma.shipment.findMany({ where: { id: { in: rows.map((r) => r.id) } }, select: { id: true, trackingNumber: true, deliveryFee: true } });
    const subtotal = lines.reduce((a, l) => a + Number(l.deliveryFee), 0);
    const tax = Math.round(subtotal * 0.075 * 100) / 100;
    const seq = await nextSequence(cid, "invoice");
    const inv = await prisma.invoice.create({ data: { companyId: cid, number: `INV-${String(seq).padStart(5, "0")}`, customerId: c.id, status: i === 0 ? "PAID" : "ISSUED", issueDate: hoursAgo(24 * 12), dueDate: new Date(Date.now() + (i === 0 ? -2 : 18) * 86400_000), subtotal, taxAmount: tax, total: subtotal + tax, amountPaid: i === 0 ? subtotal + tax : 0,
      lines: { create: lines.map((l) => ({ companyId: cid, shipmentId: l.id, description: `Delivery ${l.trackingNumber}`, quantity: 1, unitPrice: l.deliveryFee, amount: l.deliveryFee })) } } });
    if (i === 0) await prisma.payment.create({ data: { companyId: cid, customerId: c.id, invoiceId: inv.id, amount: subtotal + tax, method: "BANK_TRANSFER", reference: "TRF-88231", paidAt: hoursAgo(24 * 5), recordedById: owner.id } });
  }
  const cats = ["FUEL", "FUEL", "VEHICLE_MAINTENANCE", "OFFICE", "HUB", "TOLLS", "PACKAGING", "DRIVER_EXPENSE"] as const;
  await db.expense.createMany({ data: Array.from({ length: 40 }, () => ({ category: pick(cats), amount: between(2, 60) * 1000, incurredAt: hoursAgo(rnd() * 24 * 28), description: "Operational expense", vehicleId: rnd() < 0.5 ? pick(vehicles).id : null, branchId: pick([ikeja, lekki, abuja]).id, recordedById: owner.id })) as any });

  // Support, documents, inventory
  const seqT = await nextSequence(cid, "ticket");
  await db.supportTicket.create({ data: { number: `TKT-${String(seqT).padStart(5, "0")}`, subject: "Recipient says parcel not received", description: "Marked delivered but customer disputes receipt. Please verify proof of delivery.", category: "DELIVERY", priority: "HIGH", customerId: customers[0].id, createdById: owner.id } as any });
  await db.document.createMany({ data: [
    { ownerType: "DRIVER", ownerId: drivers[0].id, type: "Driver licence", title: `${drivers[0].name} — licence`, expiryDate: new Date(Date.now() + 12 * 86400_000), status: "EXPIRING" },
    { ownerType: "VEHICLE", ownerId: vehicles[2].id, type: "Insurance", title: "Fleet insurance certificate", expiryDate: new Date(Date.now() + 6 * 86400_000), status: "EXPIRING" },
  ] as any });
  const items = await Promise.all([["Small boxes", 400], ["Envelopes", 900], ["Packing tape", 60], ["Shipping labels (roll)", 25]].map(([name, qty]) => db.inventoryItem.create({ data: { name: name as string, quantity: qty as number, reorderLevel: 50, hubId: hubs[0].id } as any })));
  await db.inventoryMovement.createMany({ data: items.map((it) => ({ itemId: it.id, type: "RECEIVED", quantity: it.quantity, note: "Opening stock" })) as any });

  // A few live shipments via the real services (events, notifications, audit)
  const live: Awaited<ReturnType<typeof createShipment>>[] = [];
  for (let i = 0; i < 4; i++) {
    const sh = await createShipment(svc, { senderName: "Zuri Fashion", senderPhone: phone(), pickupAddress: "7 Yaba Market Rd", pickupCity: "Yaba", pickupState: "Lagos", recipientName: `${pick(first)} ${pick(last)}`, recipientPhone: phone(), deliveryAddress: `${between(1, 99)} Admiralty Way`, deliveryCity: "Lekki", deliveryState: "Lagos", packageDescription: "Fashion order", packageType: "PARCEL", weightKg: 2, quantity: 1, declaredValue: 25000, codAmount: i % 2 ? 18000 : 0, priority: "STANDARD", feePayer: "SENDER", customerId: sellers[0].id, branchId: lekki.id } as any);
    live.push(sh);
  }
  await transitionShipment(svc, live[0].id, "CONFIRMED");
  await transitionShipment(svc, live[1].id, "CONFIRMED");
  await assignShipments(svc, [live[1].id], drivers[1].id);

  // Driver GPS positions (simulated demo positions in Lagos, flagged as seeded data in the UI by source)
  for (const [i, d] of drivers.entries()) if (i !== 7) await db.driver.update({ where: { id: d.id }, data: { currentLat: 6.45 + rnd() * 0.15, currentLng: 3.3 + rnd() * 0.25, lastLocationAt: hoursAgo(rnd() * 0.4) } });

  await emit(svc, { type: "cod.mismatch", title: "COD mismatch needs review", body: "A delivery was collected short of its COD amount.", actionUrl: "/cod" });
  await emit(svc, { type: "vehicle.document_expiring", title: "Vehicle insurance expires in 6 days", body: `${vehicles[2].registrationNumber} insurance is due.`, entity: { type: "Vehicle", id: vehicles[2].id }, actionUrl: `/fleet/${vehicles[2].id}` });
  console.log(`Seeded SwiftDrop Logistics.\n  Owner login: owner@swiftdrop.test / ${PASSWORD}\n  Platform admin: admin@platform.test / ${PASSWORD}\n  Driver login: driver1@swiftdrop.test / ${PASSWORD}\n  Customer portal login: portal@meridian.test / ${PASSWORD}\n  Public booking: /book/swiftdrop   Public tracking: /track`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
