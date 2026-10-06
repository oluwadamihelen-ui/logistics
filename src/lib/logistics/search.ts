import type { TenantContext } from "../platform/context";
import { normalizeTracking } from "./tracking";

/** Global search. Each section is only queried if the user holds the matching permission; everything is tenant-scoped. */
export async function globalSearch(ctx: TenantContext, raw: string) {
  const q = raw.trim().slice(0, 80);
  if (q.length < 2) return null;
  const tn = normalizeTracking(q);
  const out: Record<string, { id: string; title: string; sub: string; href: string }[]> = {};
  const jobs: Promise<void>[] = [];
  if (ctx.can("shipments.view")) jobs.push(ctx.db.shipment.findMany({ where: { OR: [{ trackingNumber: { startsWith: tn } }, { orderNumber: { contains: q, mode: "insensitive" } }, { recipientPhone: { contains: q } }, { senderPhone: { contains: q } }, { recipientName: { contains: q, mode: "insensitive" } }] }, take: 8, orderBy: { createdAt: "desc" }, select: { id: true, trackingNumber: true, status: true, recipientName: true } }).then((r) => { out.Shipments = r.map((s) => ({ id: s.id, title: s.trackingNumber, sub: `${s.recipientName} · ${s.status.replace(/_/g, " ").toLowerCase()}`, href: `/shipments/${s.id}` })); }));
  if (ctx.can("customers.view")) jobs.push(ctx.db.customer.findMany({ where: { OR: [{ name: { contains: q, mode: "insensitive" } }, { phone: { contains: q } }, { email: { contains: q, mode: "insensitive" } }, { businessName: { contains: q, mode: "insensitive" } }] }, take: 8, select: { id: true, name: true, phone: true } }).then((r) => { out.Customers = r.map((c) => ({ id: c.id, title: c.name, sub: c.phone, href: `/customers/${c.id}` })); }));
  if (ctx.can("drivers.view")) jobs.push(ctx.db.driver.findMany({ where: { OR: [{ name: { contains: q, mode: "insensitive" } }, { phone: { contains: q } }] }, take: 8, select: { id: true, name: true, phone: true, status: true } }).then((r) => { out.Drivers = r.map((d) => ({ id: d.id, title: d.name, sub: `${d.phone} · ${d.status.toLowerCase()}`, href: `/drivers/${d.id}` })); }));
  if (ctx.can("fleet.view")) jobs.push(ctx.db.vehicle.findMany({ where: { registrationNumber: { contains: q, mode: "insensitive" } }, take: 8, select: { id: true, registrationNumber: true, type: true } }).then((r) => { out.Vehicles = r.map((v) => ({ id: v.id, title: v.registrationNumber, sub: v.type.toLowerCase(), href: `/fleet/${v.id}` })); }));
  if (ctx.can("finance.view")) {
    jobs.push(ctx.db.invoice.findMany({ where: { number: { contains: q, mode: "insensitive" } }, take: 8, select: { id: true, number: true, status: true } }).then((r) => { out.Invoices = r.map((i) => ({ id: i.id, title: i.number, sub: i.status.toLowerCase(), href: `/invoices/${i.id}` })); }));
    jobs.push(ctx.db.payment.findMany({ where: { reference: { contains: q, mode: "insensitive" } }, take: 8, select: { id: true, reference: true, amount: true, invoiceId: true } }).then((r) => { out.Payments = r.map((p) => ({ id: p.id, title: p.reference ?? "Payment", sub: String(p.amount), href: p.invoiceId ? `/invoices/${p.invoiceId}` : "/invoices" })); }));
  }
  await Promise.all(jobs);
  return Object.fromEntries(Object.entries(out).filter(([, v]) => v.length));
}
