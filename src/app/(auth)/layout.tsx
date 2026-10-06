import Image from "next/image";
import { brand } from "@/config/brand";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <aside className="relative hidden overflow-hidden bg-ink p-10 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="flex items-center gap-2.5">
          <Image src={brand.APP_LOGO} alt="" width={32} height={32} unoptimized />
          <span className="text-lg font-semibold">{brand.APP_NAME}</span>
        </div>
        <div className="relative z-10">
          <h2 className="max-w-md text-3xl font-semibold leading-tight">{brand.APP_TAGLINE}</h2>
          <ul className="mt-6 space-y-3 text-sm text-slate-300">
            <li>• Dispatch, drivers, fleet and live tracking in one place</li>
            <li>• Cash-on-delivery reconciliation and driver settlements</li>
            <li>• Proof of delivery, customer tracking and an AI operations assistant</li>
          </ul>
        </div>
        <svg className="pointer-events-none absolute -right-10 bottom-0 h-80 w-[34rem] opacity-30" viewBox="0 0 400 220" fill="none">
          <path d="M10 200 C 90 190, 110 100, 190 110 S 300 40, 390 20" stroke="rgb(var(--accent))" strokeWidth="3" strokeDasharray="6 8" strokeLinecap="round" />
          <circle cx="10" cy="200" r="7" fill="white" /><circle cx="190" cy="110" r="6" fill="white" /><circle cx="390" cy="20" r="8" fill="rgb(var(--accent))" />
        </svg>
        <p className="relative z-10 text-xs text-slate-400">© {new Date().getFullYear()} {brand.APP_NAME}</p>
      </aside>
      <main className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-md">{children}</div>
      </main>
    </div>
  );
}
