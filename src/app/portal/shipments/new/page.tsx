import { PageHeader } from "@/components/ui";
import { BookingForm } from "@/components/client/booking-form";
import { requirePortalPage } from "@/lib/platform/portal";
import { prisma } from "@/lib/platform/db";
import { customCitiesByState } from "@/lib/locations/custom";
import { portalCreateShipmentAction, portalQuoteAction } from "../../actions";

export default async function PortalNewShipment() {
  const ctx = await requirePortalPage("portal.shipments.create");
  const [company, cust] = await Promise.all([prisma.company.findUniqueOrThrow({ where: { id: ctx.companyId }, select: { currency: true, country: true } }), ctx.db.customer.findFirstOrThrow({ where: { id: ctx.customerId } })]);
  return (
    <>
      <PageHeader title="Book a shipment" back={{ href: "/portal/shipments", label: "My shipments" }} />
      <BookingForm quoteAction={portalQuoteAction} bookAction={portalCreateShipmentAction} currency={company.currency} extra={{ senderName: cust.name, senderPhone: cust.phone }} mode="portal" customCities={await customCitiesByState(ctx.db)} freeTextLocations={company.country !== "NG"} />
    </>
  );
}
