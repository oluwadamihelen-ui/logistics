import { notFound } from "next/navigation";
import Image from "next/image";
import { BookingForm } from "@/components/client/booking-form";
import { NotConfigured } from "@/components/ui";
import { createTenantClient, prisma } from "@/lib/platform/db";
import { customCitiesByState } from "@/lib/locations/custom";
import { getEntitlements } from "@/lib/platform/entitlements";
import { brand } from "@/config/brand";
import { publicBookAction, publicQuoteAction } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Book a delivery" };

export default async function BookPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const company = await prisma.company.findUnique({ where: { slug }, select: { id: true, name: true, logoUrl: true, currency: true, country: true, status: true } });
  if (!company || company.status !== "ACTIVE") notFound();
  const ent = await getEntitlements(company.id);
  const rules = await prisma.pricingRule.count({ where: { companyId: company.id, isActive: true } });
  return (
    <main className="mx-auto min-h-screen max-w-4xl px-4 py-8">
      <header className="mb-6 flex items-center gap-3">{company.logoUrl ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={company.logoUrl} alt="" className="h-10 w-10 rounded object-contain" /> : <Image src={brand.APP_LOGO} alt="" width={40} height={40} unoptimized />}<div><h1 className="text-xl font-semibold">{company.name}</h1><p className="text-sm text-slate-500">Book a pickup and get a tracking number instantly</p></div></header>
      {!ent.features.has("public_booking") || ent.access.level === "READ_ONLY" || ent.access.level === "BLOCKED" ? <NotConfigured title="Online booking is unavailable" description="This company isn't taking online bookings right now. Please contact them directly." />
        : !rules ? <NotConfigured title="Online pricing isn't set up" description="This company hasn't published a price list yet, so online booking is disabled. Please contact them directly." />
        : <BookingForm mode="public" honeypot currency={company.currency} quoteAction={publicQuoteAction} bookAction={publicBookAction} extra={{ slug }} customCities={await customCitiesByState(createTenantClient(company.id))} freeTextLocations={company.country !== "NG"} />}
      <p className="mt-8 text-center text-xs text-slate-400">Powered by {brand.APP_NAME}</p>
    </main>
  );
}
