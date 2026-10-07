import Link from "next/link";
import Image from "next/image";

export function SiteFooter({ name, tagline, logo, email }: { name: string; tagline: string; logo: string; email: string }) {
  const cols: [string, [string, string][]][] = [
    ["Product", [["Features", "/#features"], ["How it works", "/#how"], ["Pricing", "/#pricing"], ["FAQ", "/#faq"]]],
    ["Solutions", [["Courier & last-mile", "/#solutions"], ["Freight & haulage", "/#solutions"], ["Food & retail delivery", "/#solutions"], ["Multi-branch operators", "/#solutions"]]],
    ["Customers", [["Track a shipment", "/track"], ["Sign in", "/login"], ["Create an account", "/register"], ["Forgot password", "/forgot-password"]]],
  ];
  return (
    <footer className="bg-ink text-slate-300">
      <div className="mx-auto grid max-w-7xl gap-10 px-5 py-14 md:grid-cols-5">
        <div className="md:col-span-2">
          <div className="flex items-center gap-2 text-lg font-semibold text-white"><Image src={logo} alt="" width={28} height={28} unoptimized />{name}</div>
          <p className="mt-3 max-w-xs text-sm text-slate-400">{tagline}</p>
          <a href={`mailto:${email}`} className="mt-4 inline-block text-sm text-white underline-offset-4 hover:underline">{email}</a>
        </div>
        {cols.map(([h, items]) => (
          <div key={h}>
            <h4 className="text-sm font-semibold text-white">{h}</h4>
            <ul className="mt-3 space-y-2 text-sm">{items.map(([l, href]) => <li key={l}><Link href={href} className="text-slate-400 hover:text-white">{l}</Link></li>)}</ul>
          </div>
        ))}
      </div>
      <div className="border-t border-white/10">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-5 py-5 text-xs text-slate-500">
          <span>© {new Date().getFullYear()} {name}. All rights reserved.</span>
          <span className="ml-auto">Built for delivery and logistics teams.</span>
        </div>
      </div>
    </footer>
  );
}
