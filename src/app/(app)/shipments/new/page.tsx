import { PageHeader } from "@/components/ui";
import { NewShipmentForm } from "@/components/client/new-shipment-form";
import { requirePageContext } from "@/lib/platform/context";
import { prisma } from "@/lib/platform/db";

export const metadata = { title: "New shipment" };

export default async function NewShipmentPage({ searchParams }: { searchParams: Promise<{ customer?: string }> }) {
  const sp = await searchParams;
  const ctx = await requirePageContext("shipments.create");
  const [customers, branches, company] = await Promise.all([
    ctx.db.customer.findMany({ where: { isActive: true }, select: { id: true, name: true, phone: true, email: true }, orderBy: { name: "asc" }, take: 500 }),
    ctx.db.branch.findMany({ where: { isActive: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.company.findUniqueOrThrow({ where: { id: ctx.companyId }, select: { currency: true } }),
  ]);
  return (
    <>
      <PageHeader title="New shipment" back={{ href: "/shipments", label: "Shipments" }} />
      <NewShipmentForm customers={customers} branches={branches} currency={company.currency} canOverride={ctx.can("shipments.edit")} defaultCustomerId={sp.customer} />
    </>
  );
}
