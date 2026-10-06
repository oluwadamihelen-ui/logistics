import Link from "next/link";
import { redirect } from "next/navigation";
import { requirePageContext } from "@/lib/platform/context";
import { brand } from "@/config/brand";

export const dynamic = "force-dynamic";
export const metadata = { title: "Driver app" };

export default async function DriverLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requirePageContext("driver.app");
  if (!ctx.user.driverId) redirect("/forbidden");
  const unread = await ctx.db.notification.count({ where: { userId: ctx.user.id, readAt: null, dismissedAt: null } });
  return (
    <div className="mx-auto min-h-screen max-w-lg bg-surface pb-20">
      <header className="sticky top-0 z-20 flex items-center justify-between bg-ink px-4 py-3 text-white">
        <div><p className="text-xs text-slate-400">{brand.APP_NAME}</p><p className="text-sm font-semibold">{ctx.user.name}</p></div>
        <Link href="/api/auth/signout" className="text-xs text-slate-300 underline">Sign out</Link>
      </header>
      <main className="p-4">{children}</main>
      <nav className="fixed inset-x-0 bottom-0 z-20 mx-auto grid max-w-lg grid-cols-3 border-t border-line bg-white text-center text-xs" aria-label="Driver navigation">
        <Link href="/driver" className="py-3 font-medium">📦 Tasks</Link>
        <Link href="/driver/earnings" className="py-3 font-medium">💰 Earnings</Link>
        <Link href="/driver/alerts" className="py-3 font-medium">🔔 Alerts{unread > 0 && <span className="ml-1 rounded-full bg-accent px-1.5 text-white">{unread}</span>}</Link>
      </nav>
    </div>
  );
}
