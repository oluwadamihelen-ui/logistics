import Link from "next/link";
import Image from "next/image";
import { currentUserOrNull } from "@/lib/platform/context";
import { prisma } from "@/lib/platform/db";
import { homeFor } from "@/lib/platform/home";
import { brand } from "@/config/brand";
import { money } from "@/lib/utils/format";

export const dynamic = "force-dynamic";
export const metadata = { title: `${brand.APP_NAME} — ${brand.APP_TAGLINE}` };

const FEATURES: [string, string][] = [
  ["Shipments & tracking", "Book, label and track every parcel through a strict status flow, with a public tracking page for your customers."],
  ["Dispatch & routes", "Assign drivers and riders, build multi-stop routes, and watch live positions on the map."],
  ["Driver app", "Pickups, proof of delivery (photo, signature, OTP), failed-delivery reasons and SOS. Actions queue offline and sync later."],
  ["COD & finance", "Track cash collected, remittance, invoices, expenses and driver settlements with a full audit trail."],
  ["Pricing rules", "Zone, weight and priority-based pricing with a live simulator, so quotes match what you charge."],
  ["AI assistant", "Ask questions about your own data. Anything that changes data is a proposal you confirm first."],
  ["Multi-branch & roles", "Branches, hubs and fine-grained permissions per role, with strict separation between companies."],
  ["Customer portal & API", "Let customers book and follow their shipments, and connect your systems with scoped API keys and webhooks."],
];

export default async function Landing() {
  const user = await currentUserOrNull().catch(() => null);
  let dashHref: string | null = null;
  if (user) {
    let onboarded = true;
    if (user.companyId && (user.role === "COMPANY_OWNER" || user.role === "COMPANY_ADMIN")) {
      const c = await prisma.company.findUnique({ where: { id: user.companyId }, select: { onboardedAt: true } });
      onboarded = !!c?.onboardedAt;
    }
    dashHref = homeFor(user.role, onboarded);
  }
  const plans = await prisma.subscriptionPlan.findMany({ where: { isActive: true, isPublic: true }, orderBy: { sortOrder: "asc" } }).catch(() => []);

  return (
    <div className="min-h-screen bg-white text-ink">
      <header className="mx-auto flex max-w-6xl items-center gap-4 px-6 py-4">
        <Link href="/" className="flex items-center gap-2 font-semibold"><Image src={brand.APP_LOGO} alt="" width={28} height={28} unoptimized />{brand.APP_NAME}</Link>
        <nav className="ml-auto flex items-center gap-3 text-sm">
          <Link href="/track" className="hidden text-slate-600 hover:text-ink sm:inline">Track a shipment</Link>
          <a href="#pricing" className="hidden text-slate-600 hover:text-ink sm:inline">Pricing</a>
          {dashHref ? <Link href={dashHref} className="btn-primary">Open dashboard</Link> : <><Link href="/login" className="text-slate-700 hover:text-ink">Sign in</Link><Link href="/register" className="btn-primary">Start free trial</Link></>}
        </nav>
      </header>

      <section className="bg-ink text-white">
        <div className="mx-auto max-w-6xl px-6 py-20 text-center">
          <h1 className="mx-auto max-w-3xl text-4xl font-bold leading-tight sm:text-5xl">{brand.APP_TAGLINE}</h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-slate-300">Run shipments, dispatch, drivers, fleet, COD and finance from one workspace — built for courier, last-mile and freight companies.</p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            {dashHref ? <Link href={dashHref} className="btn-primary !bg-accent">Open dashboard</Link> : <><Link href="/register" className="btn-primary !bg-accent">Start free trial</Link><Link href="/login" className="btn-secondary">Sign in</Link></>}
          </div>
          <p className="mt-8 text-sm text-slate-300">Have a tracking number? <Link href="/track" className="underline">Track a shipment →</Link></p>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-16">
        <h2 className="text-center text-2xl font-semibold">Everything a delivery operation runs on</h2>
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map(([t, d]) => <div key={t} className="card p-5"><h3 className="font-semibold">{t}</h3><p className="mt-2 text-sm text-slate-600">{d}</p></div>)}
        </div>
      </section>

      {plans.length > 0 && (
        <section id="pricing" className="bg-slate-50 py-16">
          <div className="mx-auto max-w-6xl px-6">
            <h2 className="text-center text-2xl font-semibold">Plans</h2>
            <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {plans.map((p) => (
                <div key={p.id} className="card flex flex-col p-5">
                  <h3 className="font-semibold">{p.name}</h3>
                  <p className="mt-1 min-h-[2.5rem] text-xs text-slate-500">{p.description}</p>
                  <p className="mt-3 text-2xl font-bold">{p.monthlyPriceKobo === null ? "Custom" : money(p.monthlyPriceKobo / 100)}<span className="text-sm font-normal text-slate-500">{p.monthlyPriceKobo === null ? "" : " / month"}</span></p>
                  <Link href={p.monthlyPriceKobo === null ? `mailto:${brand.SUPPORT_EMAIL}?subject=Enterprise plan` : "/register"} className="btn-secondary mt-4">{p.monthlyPriceKobo === null ? "Contact sales" : "Start free trial"}</Link>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      <footer className="mx-auto flex max-w-6xl flex-wrap items-center gap-4 px-6 py-8 text-sm text-slate-500">
        <span>© {new Date().getFullYear()} {brand.APP_NAME}</span>
        <a href={`mailto:${brand.SUPPORT_EMAIL}`} className="ml-auto hover:text-ink">{brand.SUPPORT_EMAIL}</a>
        <Link href="/track" className="hover:text-ink">Track a shipment</Link>
        <Link href="/login" className="hover:text-ink">Sign in</Link>
      </footer>
    </div>
  );
}
