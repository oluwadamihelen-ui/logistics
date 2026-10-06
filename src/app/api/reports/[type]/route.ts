import { NextResponse } from "next/server";
import { requireTenant } from "@/lib/platform/context";
import { AppError } from "@/lib/platform/errors";
import { prisma } from "@/lib/platform/db";
import { auditFrom } from "@/lib/platform/audit";
import { getEntitlements } from "@/lib/platform/entitlements";
import { REPORTS, buildReport, toCsv, toPdf, toXlsx, type ReportKey } from "@/lib/logistics/reports";
import { enforceRateLimit } from "@/lib/platform/rate-limit";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ type: string }> }) {
  try {
    const { type } = await params;
    if (!(type in REPORTS)) throw new AppError("NOT_FOUND", "Unknown report");
    const def = REPORTS[type as ReportKey];
    const ctx = await requireTenant(def.permission);
    enforceRateLimit(`report:${ctx.user.id}`, 20, 60_000);
    const sp = new URL(req.url).searchParams;
    const format = (sp.get("format") ?? "csv").toLowerCase();
    if (!["csv", "xlsx", "pdf"].includes(format)) throw new AppError("VALIDATION", "Format must be csv, xlsx or pdf");
    const to = sp.get("to") ? new Date(`${sp.get("to")}T23:59:59.999Z`) : new Date();
    const from = sp.get("from") ? new Date(`${sp.get("from")}T00:00:00.000Z`) : new Date(to.getTime() - 30 * 86400_000);
    if (isNaN(from.getTime()) || isNaN(to.getTime()) || from > to) throw new AppError("VALIDATION", "Invalid date range");
    if (to.getTime() - from.getTime() > 400 * 86400_000) throw new AppError("VALIDATION", "Range cannot exceed 400 days");
    const ent = await getEntitlements(ctx.companyId);
    if (!ent.features.has("basic_reports")) throw new AppError("FEATURE_UNAVAILABLE", "Reports are not included in your plan");
    const rep = await buildReport(ctx, type as ReportKey, from, to);
    await auditFrom(ctx, "report.exported", "Report", type, undefined, { format, from, to, rows: rep.rows.length });
    const name = `${type}_${from.toISOString().slice(0, 10)}_${to.toISOString().slice(0, 10)}`;
    if (format === "csv") return new NextResponse(toCsv(rep), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}.csv"` } });
    if (format === "xlsx") return new NextResponse(new Uint8Array(await toXlsx(rep)), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="${name}.xlsx"` } });
    const company = await prisma.company.findUniqueOrThrow({ where: { id: ctx.companyId }, select: { name: true } });
    return new NextResponse(new Uint8Array(await toPdf(rep, company.name, `${from.toISOString().slice(0, 10)} to ${to.toISOString().slice(0, 10)}`)), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${name}.pdf"` } });
  } catch (e) {
    if (e instanceof AppError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("[report] failed", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Report failed" }, { status: 500 });
  }
}
