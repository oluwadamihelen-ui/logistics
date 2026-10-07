import { PageHeader } from "@/components/ui";
import { NewShipmentForm } from "@/components/client/new-shipment-form";
import { requirePageContext } from "@/lib/platform/context";
import { prisma } from "@/lib/platform/db";
import { customCitiesByState } from "@/lib/locations/custom";

export const metadata = { title: "New shipment" };

export default async function NewShipmentPage({ searchParams }: { searchParams: Promise<{ customer?: string }> }) {
  const sp = await searchParams;
  const ctx = await requirePageContext("shipments.create");
  const [customers, branches, pickupHubs, company, customCities] = await Promise.all([
    ctx.db.customer.findMany({ where: { isActive: true }, select: { id: true, name: true, phone: true, email: true }, orderBy: { name: "asc" }, take: 500 }),
    ctx.db.branch.findMany({ where: { isActive: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    ctx.db.hub.findMany({ where: { isActive: true, allowsCollection: true }, select: { id: true, name: true, addressLine: true, city: true }, orderBy: { name: "asc" } }),
    prisma.company.findUniqueOrThrow({ where: { id: ctx.companyId }, select: { currency: true, country: true } }),
    customCitiesByState(ctx.db),
  ]);
  return (
    <>
      <PageHeader title="New shipment" back={{ href: "/shipments", label: "Shipments" }} />
      <NewShipmentForm customers={customers} branches={branches} pickupPoints={pickupHubs.map((h) => ({ id: h.id, name: h.name, address: [h.addressLine, h.city].filter(Boolean).join(", ") }))} currency={company.currency} customCities={customCities} canAddCity={ctx.can("hubs.manage")} freeTextLocations={company.country !== "NG"} canOverride={ctx.can("shipments.edit")} defaultCustomerId={sp.customer} />
    </>
  );
}
