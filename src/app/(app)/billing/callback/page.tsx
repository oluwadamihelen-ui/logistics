import { redirect } from "next/navigation";
import { requirePageContext } from "@/lib/platform/context";
import { prisma } from "@/lib/platform/db";
import { confirmPayment } from "@/lib/platform/billing";

export const dynamic = "force-dynamic";

/** Browser return URL. The result is decided by server-side verification, never by query params. */
export default async function BillingCallback({ searchParams }: { searchParams: Promise<{ reference?: string; trxref?: string }> }) {
  const sp = await searchParams;
  const ctx = await requirePageContext("billing.manage");
  const ref = sp.reference ?? sp.trxref;
  if (!ref) redirect("/billing");
  const pay = await prisma.billingPayment.findUnique({ where: { reference: ref }, select: { companyId: true } });
  if (!pay || pay.companyId !== ctx.companyId) redirect("/billing?result=unknown");
  let result = "error";
  try { result = (await confirmPayment(ref)).status.toLowerCase(); } catch { /* shown as error */ }
  redirect(`/billing?result=${result}`);
}
