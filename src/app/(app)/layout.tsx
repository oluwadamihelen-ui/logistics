import { redirect } from "next/navigation";
import { brand } from "@/config/brand";
import { NAV } from "@/config/nav";
import { AppShell } from "@/components/client/app-shell";
import { requirePageContext } from "@/lib/platform/context";
import { prisma } from "@/lib/platform/db";
import { getEntitlements } from "@/lib/platform/entitlements";
import { ROLE_LABELS } from "@/lib/platform/permissions";
import { homeFor } from "@/lib/platform/home";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requirePageContext();
  // Drivers and portal users have their own experiences.
  if (ctx.can("driver.app") && !ctx.can("dashboard.view")) redirect(homeFor(ctx.user.role));
  if (ctx.can("portal.access") && !ctx.can("dashboard.view")) redirect(homeFor(ctx.user.role));

  const [company, ent, unread] = await Promise.all([
    prisma.company.findUnique({ where: { id: ctx.companyId }, select: { name: true, logoUrl: true } }),
    getEntitlements(ctx.companyId),
    ctx.db.notification.count({ where: { userId: ctx.user.id, readAt: null, dismissedAt: null } }),
  ]);

  const nav = NAV.map((g) => ({
    label: g.label,
    items: g.items
      .filter((i) => !i.permission || ctx.can(i.permission))
      .map((i) => ({ href: i.href, label: i.label, icon: i.icon, locked: !!i.feature && !ent.features.has(i.feature) })),
  })).filter((g) => g.items.length);

  let banner: { tone: "info" | "warning" | "danger"; text: string; href?: string } | null = null;
  const href = ctx.can("billing.manage") ? "/billing" : undefined;
  if (ent.access.status === "TRIALING" && ent.subscription?.trialEndsAt) {
    const days = Math.max(0, Math.ceil((ent.subscription.trialEndsAt.getTime() - Date.now()) / 86400_000));
    banner = { tone: days <= 3 ? "warning" : "info", text: `Free trial: ${days} day${days === 1 ? "" : "s"} left.`, href };
  } else if (ent.access.level === "GRACE") banner = { tone: "warning", text: "Your subscription payment is overdue. Update billing to avoid losing access.", href };
  else if (ent.access.level === "READ_ONLY") banner = { tone: "danger", text: `${ent.access.reason ?? "Subscription inactive"} — your workspace is read-only.`, href };
  else if (ent.access.level === "BLOCKED") banner = { tone: "danger", text: "This account is suspended. Contact support." };

  return (
    <AppShell brandName={brand.APP_NAME} logo={company?.logoUrl || brand.APP_LOGO} companyName={company?.name ?? ""} userName={ctx.user.name} roleLabel={ROLE_LABELS[ctx.user.role]} nav={nav} unread={unread} banner={banner}>
      {children}
    </AppShell>
  );
}
