import { notFound } from "next/navigation";
import { Badge, Card, CardHeader, DescriptionList, PageHeader, StatCard, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { ActionButton, Field, FieldGrid, ModalForm, SelectField } from "@/components/client/form";
import { prisma } from "@/lib/platform/db";
import { currentUsage, getEntitlements, limitFor, LIMIT_KEYS } from "@/lib/platform/entitlements";
import { setCompanyStatusAction, setSubscriptionAction } from "../../actions";
import { dateOnly, dateTime, titleCase } from "@/lib/utils/format";

export default async function CompanyAdmin({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const c = await prisma.company.findUnique({ where: { id }, include: { subscription: { include: { plan: true } } } });
  if (!c) notFound();
  const [ent, usage, plans, owner, logs, shipTotal] = await Promise.all([getEntitlements(id), currentUsage(id), prisma.subscriptionPlan.findMany({ orderBy: { sortOrder: "asc" } }), prisma.user.findFirst({ where: { companyId: id, role: "COMPANY_OWNER" }, select: { name: true, email: true, lastLoginAt: true } }), prisma.auditLog.findMany({ where: { companyId: id }, orderBy: { createdAt: "desc" }, take: 15 }), prisma.shipment.count({ where: { companyId: id } })]);
  return (
    <>
      <PageHeader back={{ href: "/platform/companies", label: "Companies" }} title={c.name} subtitle={<span className="flex items-center gap-2"><Badge tone={c.status === "ACTIVE" ? "success" : c.status === "SUSPENDED" ? "danger" : "neutral"}>{titleCase(c.status)}</Badge>{c.slug}</span>}
        actions={<>{c.status !== "SUSPENDED" ? <ActionButton variant="danger" label="Suspend company" confirm="Suspend this company? All its users are signed out immediately and cannot sign in." action={setCompanyStatusAction} args={{ id, status: "SUSPENDED" }} /> : <ActionButton variant="primary" label="Reactivate" action={setCompanyStatusAction} args={{ id, status: "ACTIVE" }} />}
          <ModalForm trigger="Manage subscription" triggerClassName="btn-secondary" title="Manage subscription" action={setSubscriptionAction} extra={{ companyId: id }}>
            <SelectField name="planKey" label="Plan" placeholder="Keep current" options={plans.map((p) => ({ value: p.key, label: p.name }))} /><SelectField name="status" label="Status" placeholder="Keep current" options={["TRIALING", "ACTIVE", "PAST_DUE", "CANCELLED", "EXPIRED", "SUSPENDED"].map((s) => ({ value: s, label: titleCase(s) }))} />
            <FieldGrid><Field name="extendTrialDays" label="Extend trial (days)" type="number" min="0" /><Field name="extendPeriodDays" label="Extend paid period (days)" type="number" min="0" /></FieldGrid>
            <Field name="limitOverrides" label="Limit overrides (JSON)" placeholder='{"drivers": 500, "users": null}' hint="null = unlimited. Leave blank to keep as is." /></ModalForm></>} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4"><StatCard label="Plan" value={ent.planName ?? "—"} /><StatCard label="Access" value={titleCase(ent.access.status)} tone={ent.access.level === "FULL" ? "success" : "warning"} /><StatCard label="Total shipments" value={shipTotal.toLocaleString()} /><StatCard label="Period ends" value={dateOnly(c.subscription?.currentPeriodEnd ?? c.subscription?.trialEndsAt)} /></div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card><CardHeader title="Usage vs limits" /><ul className="divide-y divide-line text-sm">{LIMIT_KEYS.map((k) => <li key={k} className="flex justify-between px-5 py-3"><span>{titleCase(k.replace(/([A-Z])/g, " $1"))}</span><span className="tabular-nums">{usage[k]} / {limitFor(ent, k) ?? "∞"}</span></li>)}</ul></Card>
        <Card><CardHeader title="Contact" /><div className="p-5"><DescriptionList items={[{ label: "Owner", value: owner?.name }, { label: "Email", value: owner?.email }, { label: "Last owner sign-in", value: owner?.lastLoginAt ? dateTime(owner.lastLoginAt) : "Never" }, { label: "Phone", value: c.phone }, { label: "Location", value: [c.city, c.state, c.country].filter(Boolean).join(", ") }, { label: "Onboarded", value: c.onboardedAt ? dateOnly(c.onboardedAt) : "Not yet" }]} /></div></Card>
      </div>
      <Card className="mt-4"><CardHeader title="Recent audit activity" /><Table><THead><TH>When</TH><TH>Who</TH><TH>Action</TH><TH>Resource</TH></THead><TBody>{logs.map((l) => <TR key={l.id}><TD className="text-xs">{dateTime(l.createdAt)}</TD><TD>{l.actorName ?? "system"}</TD><TD className="font-mono text-xs">{l.action}</TD><TD className="text-xs">{l.resourceType}</TD></TR>)}</TBody></Table></Card>
    </>
  );
}
