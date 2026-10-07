import Link from "next/link";
import { currentUserOrNull } from "@/lib/platform/context";
import { prisma } from "@/lib/platform/db";
import { homeFor } from "@/lib/platform/home";
import { brand } from "@/config/brand";
import { SiteHeader } from "@/components/marketing/site-header";
import { SiteFooter } from "@/components/marketing/site-footer";
import { PricingSection, type PricingPlan } from "@/components/marketing/pricing-section";

export const dynamic = "force-dynamic";
export const metadata = { title: `${brand.APP_NAME} — ${brand.APP_TAGLINE}`, description: "Shipments, dispatch, drivers, fleet, COD and finance in one workspace for delivery and logistics companies." };

const STATS: [string, string][] = [["16", "shipment statuses tracked end to end"], ["14", "staff roles with per-user permissions"], ["3", "proof-of-delivery methods: photo, signature, OTP"], ["100%", "tenant-isolated company data"]];

const FEATURES: [string, string, string][] = [
  ["📦", "Shipments & tracking", "Book, label and track every parcel through a strict status flow, with a public tracking page and delivery notifications."],
  ["🧭", "Dispatch & routes", "Assign drivers and riders from one board, build multi-stop routes and see live positions on the map."],
  ["📱", "Driver app", "Tasks, navigation, proof of delivery, failed-delivery reasons and SOS. Actions queue offline and sync when the signal returns."],
  ["💵", "COD & finance", "Track cash collected, remittance, invoices, expenses and driver settlements with a complete audit trail."],
  ["🏷️", "Pricing rules", "Zone, weight and priority-based pricing with a live simulator so quotes always match what you charge."],
  ["✨", "AI assistant", "Ask questions about your own operation. Anything that changes data is a proposal you confirm first."],
  ["🏢", "Branches, hubs & roles", "Run many branches and hubs with fine-grained permissions and strict separation between companies."],
  ["🔌", "Customer portal & API", "Let customers book and follow shipments, and connect your systems with scoped API keys and signed webhooks."],
];

const STEPS: [string, string][] = [
  ["Create your workspace", "Sign up, add your branches, hubs and pricing rules. The setup wizard gets you ready in minutes."],
  ["Book and dispatch", "Create shipments yourself, let customers book online, then assign drivers and riders in a click."],
  ["Deliver with proof", "Drivers pick up and deliver from their phone, capturing photo, signature or OTP, and COD amounts."],
  ["Reconcile and grow", "Cash, invoices and driver settlements reconcile automatically, with analytics to show what to improve."],
];

const SOLUTIONS: [string, string, string[]][] = [
  ["Courier & last-mile", "Same-day and next-day parcel delivery in dense cities.", ["Rider app with offline support", "Zone-based pricing", "COD remittance tracking"]],
  ["Freight & haulage", "Long-haul and inter-city movement with fleet to manage.", ["Fleet, documents and expiry alerts", "Multi-stop routes", "Driver settlements and expenses"]],
  ["Retail & food delivery", "Merchants who deliver their own orders.", ["Public booking page", "Customer tracking links", "SMS and WhatsApp updates"]],
  ["Multi-branch operators", "Networks with hubs, branches and corporate clients.", ["Branch-scoped access", "Corporate accounts and invoices", "Audit log and API access"]],
];

const FAQ: [string, string][] = [
  ["How does the free trial work?", "Every new workspace starts with a 14-day trial. You don't need a card to begin, and you choose a plan when you're ready."],
  ["Can my drivers work without internet?", "Yes. The driver app saves every action on the device first and syncs automatically when the connection returns, without duplicating updates."],
  ["Is my company's data separate from other companies?", "Yes. Every record belongs to one company and all access is checked on the server, so one company can never see another's data."],
  ["How do I get paid on COD deliveries?", "The system records cash collected by each driver, tracks remittance to your office and flags anything still outstanding."],
  ["What payment methods do you accept?", "Subscriptions are paid online by card through Paystack, with optional automatic renewal that you can turn off at any time."],
  ["Can I connect my own systems?", "Yes, on plans that include API access: scoped API keys, idempotent requests and signed webhooks."],
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
  const rows = await prisma.subscriptionPlan.findMany({ where: { isActive: true, isPublic: true }, orderBy: { sortOrder: "asc" } }).catch(() => []);
  const plans: PricingPlan[] = rows.map((p) => ({ key: p.key, name: p.name, description: p.description, monthly: p.monthlyPriceKobo, annual: p.annualPriceKobo, currency: p.currency, limits: p.limits as Record<string, number | null>, features: p.features, popular: p.key === "professional" }));
  const cta = dashHref
    ? <Link href={dashHref} className="btn-primary !bg-accent !px-6 !py-3 text-base">Open dashboard</Link>
    : <><Link href="/register" className="btn-primary !bg-accent !px-6 !py-3 text-base">Start free trial</Link><a href="#how" className="btn-secondary !px-6 !py-3 text-base">See how it works</a></>;

  return (
    <div className="min-h-screen bg-white text-ink">
      <SiteHeader name={brand.APP_NAME} logo={brand.APP_LOGO} dashHref={dashHref} />

      {/* Hero */}
      <section className="relative overflow-hidden bg-ink text-white">
        <div aria-hidden className="pointer-events-none absolute inset-0 opacity-40" style={{ background: "radial-gradient(60% 50% at 80% 0%, rgb(var(--brand, 15 98 254) / 0.55), transparent), radial-gradient(40% 40% at 0% 100%, rgba(255,140,0,0.25), transparent)" }} />
        <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-5 py-20 lg:grid-cols-2 lg:py-28">
          <div>
            <span className="inline-block rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-medium text-slate-200">Built for delivery &amp; logistics companies</span>
            <h1 className="mt-5 text-4xl font-bold leading-tight tracking-tight sm:text-5xl lg:text-6xl">{brand.APP_TAGLINE}</h1>
            <p className="mt-5 max-w-xl text-lg text-slate-300">Shipments, dispatch, drivers, fleet, COD and finance in one workspace. Fewer spreadsheets, fewer phone calls, fewer lost parcels.</p>
            <div className="mt-8 flex flex-wrap gap-3">{cta}</div>
            <p className="mt-5 text-sm text-slate-400">14-day free trial · No card required · Cancel any time</p>
          </div>
          {/* Product preview (illustrative) */}
          <div className="relative hidden lg:block" aria-hidden>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4 shadow-2xl backdrop-blur">
              <div className="flex items-center gap-1.5 pb-3"><span className="h-2.5 w-2.5 rounded-full bg-red-400" /><span className="h-2.5 w-2.5 rounded-full bg-amber-400" /><span className="h-2.5 w-2.5 rounded-full bg-emerald-400" /></div>
              <div className="grid grid-cols-3 gap-3">
                {[["Delivered today", "128"], ["Out for delivery", "46"], ["COD to remit", "₦412,500"]].map(([l, v]) => <div key={l} className="rounded-xl bg-white p-3 text-ink"><p className="text-[11px] text-slate-500">{l}</p><p className="mt-1 text-xl font-bold">{v}</p></div>)}
              </div>
              <div className="mt-3 space-y-2">
                {[["SDK7M2P9XQ4", "Ikeja → Lekki", "Out for delivery", "bg-amber-100 text-amber-800"], ["SDK3H8T1ZW6", "Yaba → Victoria Island", "Delivered", "bg-emerald-100 text-emerald-800"], ["SDK9C4N2LR8", "Surulere → Ikoyi", "Ready for dispatch", "bg-blue-100 text-blue-800"]].map(([t, r, s, c]) => (
                  <div key={t} className="flex items-center justify-between rounded-xl bg-white px-4 py-3 text-ink"><div><p className="font-mono text-xs font-semibold">{t}</p><p className="text-xs text-slate-500">{r}</p></div><span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${c}`}>{s}</span></div>
                ))}
              </div>
            </div>
            <p className="mt-2 text-right text-[11px] text-slate-500">Illustrative preview</p>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="border-b border-line bg-white">
        <div className="mx-auto grid max-w-7xl gap-8 px-5 py-10 sm:grid-cols-2 lg:grid-cols-4">
          {STATS.map(([n, l]) => <div key={l} className="text-center"><p className="text-3xl font-bold text-brand">{n}</p><p className="mt-1 text-sm text-slate-500">{l}</p></div>)}
        </div>
      </section>

      {/* Features */}
      <section id="features" className="mx-auto max-w-7xl scroll-mt-20 px-5 py-20">
        <div className="mx-auto max-w-2xl text-center"><p className="text-sm font-semibold uppercase tracking-wide text-brand">Features</p><h2 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Everything a delivery operation runs on</h2><p className="mt-3 text-slate-600">One system from the first booking to the final settlement.</p></div>
        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map(([i, t, d]) => <div key={t} className="rounded-2xl border border-line bg-white p-6 transition hover:-translate-y-0.5 hover:shadow-lg"><span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-soft text-xl">{i}</span><h3 className="mt-4 font-semibold">{t}</h3><p className="mt-2 text-sm text-slate-600">{d}</p></div>)}
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="scroll-mt-20 bg-slate-50 py-20">
        <div className="mx-auto max-w-7xl px-5">
          <div className="mx-auto max-w-2xl text-center"><p className="text-sm font-semibold uppercase tracking-wide text-brand">How it works</p><h2 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">From booking to settlement in four steps</h2></div>
          <ol className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {STEPS.map(([t, d], i) => <li key={t} className="relative rounded-2xl bg-white p-6 shadow-sm"><span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand text-sm font-bold text-white">{i + 1}</span><h3 className="mt-4 font-semibold">{t}</h3><p className="mt-2 text-sm text-slate-600">{d}</p></li>)}
          </ol>
        </div>
      </section>

      {/* Solutions */}
      <section id="solutions" className="mx-auto max-w-7xl scroll-mt-20 px-5 py-20">
        <div className="mx-auto max-w-2xl text-center"><p className="text-sm font-semibold uppercase tracking-wide text-brand">Solutions</p><h2 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Made for how you deliver</h2></div>
        <div className="mt-12 grid gap-6 md:grid-cols-2">
          {SOLUTIONS.map(([t, d, pts]) => (
            <div key={t} className="rounded-2xl border border-line p-7">
              <h3 className="text-lg font-semibold">{t}</h3><p className="mt-1 text-sm text-slate-600">{d}</p>
              <ul className="mt-4 space-y-2 text-sm text-slate-700">{pts.map((x) => <li key={x} className="flex gap-2"><span className="text-brand">✓</span>{x}</li>)}</ul>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing */}
      {plans.length > 0 && (
        <section id="pricing" className="scroll-mt-20 bg-slate-50 py-20">
          <div className="mx-auto max-w-7xl px-5">
            <div className="mx-auto max-w-2xl text-center"><p className="text-sm font-semibold uppercase tracking-wide text-brand">Pricing</p><h2 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Simple plans that grow with your fleet</h2><p className="mt-3 text-slate-600">Start free for 14 days. Upgrade, downgrade or cancel whenever you like.</p></div>
            <div className="mt-10"><PricingSection plans={plans} contactEmail={brand.SUPPORT_EMAIL} /></div>
          </div>
        </section>
      )}

      {/* FAQ */}
      <section id="faq" className="mx-auto max-w-3xl scroll-mt-20 px-5 py-20">
        <div className="text-center"><p className="text-sm font-semibold uppercase tracking-wide text-brand">FAQ</p><h2 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Questions, answered</h2></div>
        <div className="mt-10 divide-y divide-line rounded-2xl border border-line">
          {FAQ.map(([q, a]) => <details key={q} className="group px-6 py-4"><summary className="flex cursor-pointer list-none items-center justify-between font-medium">{q}<span className="ml-4 text-xl text-slate-400 transition group-open:rotate-45">+</span></summary><p className="mt-3 text-sm text-slate-600">{a}</p></details>)}
        </div>
      </section>

      {/* CTA */}
      <section className="px-5 pb-20">
        <div className="mx-auto max-w-5xl rounded-3xl bg-ink px-8 py-14 text-center text-white">
          <h2 className="text-3xl font-bold tracking-tight">Ready to run deliveries without the chaos?</h2>
          <p className="mx-auto mt-3 max-w-xl text-slate-300">Set up your workspace in minutes. Questions first? We&apos;re happy to talk.</p>
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            {dashHref ? <Link href={dashHref} className="btn-primary !bg-accent !px-6 !py-3 text-base">Open dashboard</Link> : <Link href="/register" className="btn-primary !bg-accent !px-6 !py-3 text-base">Start free trial</Link>}
            <a href={`mailto:${brand.SUPPORT_EMAIL}`} className="btn-secondary !px-6 !py-3 text-base">Talk to us</a>
          </div>
        </div>
      </section>

      <SiteFooter name={brand.APP_NAME} tagline={brand.APP_TAGLINE} logo={brand.APP_LOGO} email={brand.SUPPORT_EMAIL} />
    </div>
  );
}
