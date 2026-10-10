import Link from "next/link";
import Image from "next/image";
import { brand } from "@/config/brand";

const COLS: [string, [string, string][]][] = [
  ["Product", [["Features", "/#features"], ["How it works", "/#how"], ["Pricing", "/#pricing"], ["FAQ", "/#faq"]]],
  ["Solutions", [["Courier & last-mile", "/#solutions"], ["Freight & haulage", "/#solutions"], ["Food & retail delivery", "/#solutions"], ["Multi-branch operators", "/#solutions"]]],
  ["Customers", [["Track a shipment", "/track"], ["Sign in", "/login"], ["Create an account", "/register"], ["Forgot password", "/forgot-password"]]],
  ["Company", [[`About ${brand.COMPANY_NAME}`, "/about"], ["Terms of Service", "/terms"], ["Privacy Policy", "/privacy"], ["Contact", `mailto:${brand.SUPPORT_EMAIL}`]]],
];

/** "A product of <company>" credit, reused wherever the product is shown to the public. */
export function ProductOf({ className = "" }: { className?: string }) {
  return (
    <span className={className}>
      {brand.APP_NAME} is a product of{" "}
      {brand.COMPANY_URL ? <a href={brand.COMPANY_URL} target="_blank" rel="noopener noreferrer" className="font-semibold underline-offset-4 hover:underline">{brand.COMPANY_NAME}</a> : <Link href="/about" className="font-semibold underline-offset-4 hover:underline">{brand.COMPANY_NAME}</Link>}
    </span>
  );
}

export function SiteFooter() {
  return (
    <footer className="bg-ink text-slate-300">
      <div className="mx-auto grid max-w-7xl gap-10 px-5 py-14 md:grid-cols-6">
        <div className="md:col-span-2">
          <div className="flex items-center gap-2 text-lg font-semibold text-white"><Image src={brand.APP_LOGO} alt="" width={28} height={28} unoptimized />{brand.APP_NAME}</div>
          <p className="mt-3 max-w-xs text-sm text-slate-400">{brand.APP_TAGLINE}</p>
          <a href={`mailto:${brand.SUPPORT_EMAIL}`} className="mt-4 inline-block text-sm text-white underline-offset-4 hover:underline">{brand.SUPPORT_EMAIL}</a>
        </div>
        {COLS.map(([h, items]) => (
          <div key={h}>
            <h4 className="text-sm font-semibold text-white">{h}</h4>
            <ul className="mt-3 space-y-2 text-sm">{items.map(([l, href]) => <li key={l}>{href.startsWith("mailto:") ? <a href={href} className="text-slate-400 hover:text-white">{l}</a> : <Link href={href} className="text-slate-400 hover:text-white">{l}</Link>}</li>)}</ul>
          </div>
        ))}
      </div>
      <div className="border-t border-white/10">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-5 py-5 text-xs text-slate-400">
          <span>© {new Date().getFullYear()} {brand.COMPANY_NAME}. All rights reserved.</span>
          <ProductOf className="text-slate-300" />
          <span className="ml-auto flex gap-4"><Link href="/terms" className="hover:text-white">Terms</Link><Link href="/privacy" className="hover:text-white">Privacy</Link></span>
        </div>
      </div>
    </footer>
  );
}
