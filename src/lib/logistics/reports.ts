/** Tabular report definitions. Every report is a tenant-scoped query returning {columns, rows}. */
import { prisma, num } from "../platform/db";
import type { ServiceCtx } from "../platform/service";
import { branchPerformance, deliveryStats, failedDeliveries, driverPerformance, zonePerformance } from "./analytics";

export interface Report { title: string; columns: string[]; rows: (string | number | null)[][]; note?: string }
export const REPORTS = {
  "daily-shipments": { label: "Daily shipments", permission: "reports.view" },
  "delivery-performance": { label: "Delivery performance (by zone)", permission: "reports.view" },
  "failed-deliveries": { label: "Failed deliveries", permission: "reports.view" },
  "driver-performance": { label: "Driver performance", permission: "reports.view" },
  fleet: { label: "Fleet report", permission: "fleet.view" },
  cod: { label: "COD report", permission: "cod.view" },
  revenue: { label: "Revenue report", permission: "finance.view" },
  customers: { label: "Customer report", permission: "customers.view" },
  branches: { label: "Branch report", permission: "reports.view" },
  expenses: { label: "Expense report", permission: "expenses.manage" },
  settlements: { label: "Settlement report", permission: "settlements.manage" },
} as const;
export type ReportKey = keyof typeof REPORTS;
const MAX = 50_000;
const d = (x: Date | null | undefined) => (x ? x.toISOString().slice(0, 16).replace("T", " ") : null);

export async function buildReport(svc: ServiceCtx, key: ReportKey, from: Date, to: Date): Promise<Report> {
  const id = svc.companyId;
  switch (key) {
    case "daily-shipments": {
      const rows = await svc.db.shipment.findMany({ where: { createdAt: { gte: from, lte: to } }, orderBy: { createdAt: "desc" }, take: MAX, include: { driver: { select: { name: true } }, branch: { select: { name: true } } } });
      return { title: "Daily shipments", columns: ["Created", "Tracking", "Order", "Status", "Sender", "Recipient", "Destination", "Driver", "Branch", "Fee", "COD", "Delivered"], rows: rows.map((s) => [d(s.createdAt), s.trackingNumber, s.orderNumber, s.status, s.senderName, s.recipientName, `${s.deliveryCity}, ${s.deliveryState}`, s.driver?.name ?? null, s.branch?.name ?? null, num(s.deliveryFee), num(s.codAmount), d(s.deliveredAt)]) };
    }
    case "delivery-performance": {
      const z = await zonePerformance(svc, { from, to }); const st = await deliveryStats(svc, { from, to });
      return { title: "Delivery performance", note: `Success rate ${st.deliverySuccessRatePct ?? "n/a"}% · avg delivery ${st.avgDeliveryHours ?? "n/a"}h`, columns: ["Zone", "Shipments", "Delivered", "Problem shipments", "Problem %", "Avg delivery hours"], rows: z.map((x) => [x.zone, x.shipments, x.delivered, x.problem, x.problemPct, x.avgDeliveryHours]) };
    }
    case "failed-deliveries": {
      const f = await failedDeliveries(svc, { from, to });
      return { title: "Failed deliveries", columns: ["When", "Tracking", "City", "Reason", "Driver"], rows: f.recent.map((r) => [d(r.at), r.tracking, r.city, r.reason, r.driver]), note: `${f.total} failed attempts. Top reasons: ${f.reasons.slice(0, 3).map((r) => `${r.reason} (${r.count})`).join(", ") || "none"}` };
    }
    case "driver-performance": {
      const p = await driverPerformance(svc, { from, to });
      return { title: "Driver performance", columns: ["Driver", "Delivered", "Failed attempts", "Success %", "Avg pickup→delivery (h)", "Revenue", "COD collected", "COD held"], rows: p.map((x) => [x.driver, x.delivered, x.failedAttempts, x.successRatePct, x.avgPickupToDeliveryHours, x.revenue, x.codCollected, x.codHeld]) };
    }
    case "fleet": {
      const v = await svc.db.vehicle.findMany({ where: { isActive: true }, include: { driver: { select: { name: true } } }, orderBy: { registrationNumber: "asc" } });
      const spend = await svc.db.expense.groupBy({ by: ["vehicleId"], where: { vehicleId: { not: null }, incurredAt: { gte: from, lte: to } }, _sum: { amount: true } });
      const trips = await svc.db.shipment.groupBy({ by: ["vehicleId"], where: { vehicleId: { not: null }, status: "DELIVERED", deliveredAt: { gte: from, lte: to } }, _count: { _all: true } });
      return { title: "Fleet report", columns: ["Registration", "Type", "Status", "Driver", "Mileage km", "Deliveries", "Spend", "Insurance expiry", "Inspection expiry"], rows: v.map((x) => [x.registrationNumber, x.type, x.status, x.driver?.name ?? null, x.mileageKm, trips.find((t) => t.vehicleId === x.id)?._count._all ?? 0, num(spend.find((s) => s.vehicleId === x.id)?._sum.amount), d(x.insuranceExpiry)?.slice(0, 10) ?? null, d(x.inspectionExpiry)?.slice(0, 10) ?? null]) };
    }
    case "cod": {
      const r = await svc.db.codTransaction.findMany({ where: { createdAt: { gte: from, lte: to } }, orderBy: { createdAt: "desc" }, take: MAX, include: { shipment: { select: { trackingNumber: true } }, driver: { select: { name: true } } } });
      return { title: "COD report", columns: ["Tracking", "Driver", "Status", "Due", "Collected", "Remitted", "Settled", "Collected at", "Reference"], rows: r.map((x) => [x.shipment.trackingNumber, x.driver?.name ?? null, x.status, num(x.amountDue), num(x.amountCollected), num(x.amountRemitted), num(x.amountSettled), d(x.collectedAt), x.settlementReference]) };
    }
    case "revenue": {
      const rows = await prisma.$queryRaw<{ day: string; deliveries: bigint; revenue: unknown; cod: unknown }[]>`SELECT to_char(date_trunc('day', s."deliveredAt"),'YYYY-MM-DD') AS day, COUNT(*) AS deliveries, SUM(s."deliveryFee") AS revenue, COALESCE(SUM(s."codAmount"),0) AS cod FROM "Shipment" s WHERE s."companyId" = ${id} AND s."status" = 'DELIVERED' AND s."deliveredAt" >= ${from} AND s."deliveredAt" <= ${to} GROUP BY 1 ORDER BY 1`;
      return { title: "Revenue report", columns: ["Day", "Deliveries", "Delivery revenue", "COD value delivered"], rows: rows.map((x) => [x.day, Number(x.deliveries), num(x.revenue as any), num(x.cod as any)]) };
    }
    case "customers": {
      const rows = await prisma.$queryRaw<{ name: string; type: string; total: bigint; delivered: bigint; failed: bigint; revenue: unknown }[]>`SELECT c."name", c."type"::text AS type, COUNT(s.*) AS total, COUNT(s.*) FILTER (WHERE s."status" = 'DELIVERED') AS delivered, COUNT(s.*) FILTER (WHERE s."status" IN ('DELIVERY_FAILED','RETURNING','RETURNED_TO_HUB','RETURNED_TO_SENDER')) AS failed, COALESCE(SUM(s."deliveryFee") FILTER (WHERE s."status" = 'DELIVERED'),0) AS revenue FROM "Customer" c LEFT JOIN "Shipment" s ON s."customerId" = c."id" AND s."createdAt" >= ${from} AND s."createdAt" <= ${to} WHERE c."companyId" = ${id} GROUP BY c."id", c."name", c."type" ORDER BY revenue DESC LIMIT ${MAX}`;
      return { title: "Customer report", columns: ["Customer", "Type", "Shipments", "Delivered", "Failed/returned", "Revenue"], rows: rows.map((x) => [x.name, x.type, Number(x.total), Number(x.delivered), Number(x.failed), num(x.revenue as any)]) };
    }
    case "branches": {
      const b = await branchPerformance(svc, { from, to });
      return { title: "Branch report", columns: ["Branch", "Shipments", "Delivered", "Problem", "Delivered %", "Revenue"], rows: b.map((x) => [x.branch, x.shipments, x.delivered, x.problem, x.deliveredPct, x.revenue]) };
    }
    case "expenses": {
      const e = await svc.db.expense.findMany({ where: { incurredAt: { gte: from, lte: to } }, orderBy: { incurredAt: "desc" }, take: MAX });
      return { title: "Expense report", columns: ["Date", "Category", "Description", "Amount"], rows: e.map((x) => [d(x.incurredAt)?.slice(0, 10) ?? null, x.category, x.description, num(x.amount)]) };
    }
    case "settlements": {
      const s = await svc.db.settlement.findMany({ where: { createdAt: { gte: from, lte: to } }, orderBy: { createdAt: "desc" }, take: MAX, include: { driver: { select: { name: true } } } });
      return { title: "Settlement report", columns: ["Number", "Driver", "Period start", "Period end", "Deliveries", "Earnings", "Bonuses", "Deductions", "COD held", "Net payable", "Status"], rows: s.map((x) => [x.number, x.driver.name, d(x.periodStart)?.slice(0, 10) ?? null, d(x.periodEnd)?.slice(0, 10) ?? null, x.deliveriesCount, num(x.earnings), num(x.bonuses), num(x.deductions), Math.max(0, num(x.codCollected) - num(x.codRemitted)), num(x.netPayable), x.status]) };
    }
  }
}

/** Neutralise spreadsheet formula injection (cells that start with = + - @ are interpreted as formulas). */
const safe = (v: string | number | null) => (typeof v === "string" && /^[=+\-@\t\r]/.test(v) ? `'${v}` : v);
const csvCell = (v: string | number | null) => { const x = safe(v); if (x === null) return ""; const s = String(x); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

export function toCsv(r: Report): string {
  return "﻿" + [r.columns, ...r.rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
}

export async function toXlsx(r: Report): Promise<Buffer> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(r.title.slice(0, 30));
  ws.addRow(r.columns).font = { bold: true };
  for (const row of r.rows) ws.addRow(row.map(safe));
  ws.columns.forEach((c, i) => { c.width = Math.min(40, Math.max(12, String(r.columns[i]).length + 4)); });
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export async function toPdf(r: Report, company: string, range: string): Promise<Buffer> {
  const PDFDocument = (await import("pdfkit")).default;
  const doc = new PDFDocument({ size: "A4", layout: "landscape", margin: 30 });
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((res) => doc.on("end", () => res(Buffer.concat(chunks))));
  doc.fontSize(16).text(`${company} — ${r.title}`).fontSize(9).fillColor("#64748b").text(range + (r.note ? ` · ${r.note}` : "")).moveDown(0.8).fillColor("#000");
  const width = doc.page.width - 60, colW = width / r.columns.length;
  const row = (cells: (string | number | null)[], bold = false) => {
    const y = doc.y; doc.fontSize(8).font(bold ? "Helvetica-Bold" : "Helvetica");
    const h = Math.max(...cells.map((c) => doc.heightOfString(String(c ?? ""), { width: colW - 4 })), 10) + 4;
    if (y + h > doc.page.height - 40) { doc.addPage(); return row(cells, bold); }
    cells.forEach((c, i) => doc.text(String(c ?? ""), 30 + i * colW, y, { width: colW - 4 }));
    doc.y = y + h; doc.moveTo(30, doc.y - 2).lineTo(30 + width, doc.y - 2).strokeColor("#e2e8f0").stroke();
  };
  row(r.columns, true);
  for (const x of r.rows.slice(0, 2000)) row(x);
  if (r.rows.length > 2000) doc.moveDown().fontSize(8).text(`Showing first 2,000 of ${r.rows.length} rows — download CSV/Excel for the full set.`);
  doc.end();
  return done;
}
