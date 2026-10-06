import Link from "next/link";
import { Alert, Badge, Card, CardHeader, PageHeader, Table, TBody, TD, TH, THead, TR, Tabs } from "@/components/ui";
import { ActionButton, CheckboxField, Field, FieldGrid, Form, ModalForm, SelectField, TextareaField } from "@/components/client/form";
import { LogoField } from "@/components/client/logo-field";
import { requirePageContext } from "@/lib/platform/context";
import { prisma } from "@/lib/platform/db";
import { providerStatus } from "@/lib/platform/notifications/providers";
import { ASSIGNABLE_ROLES, PERMISSIONS, ROLE_LABELS, ROLE_PERMISSIONS } from "@/lib/platform/permissions";
import { DEFAULT_TEMPLATES } from "@/lib/logistics/customer-messages";
import { changeOwnPasswordAction, createUserAction, resetPasswordAction, updateChannelsAction, updateCompanyAction, updateInvoicingAction, updateOperationsAction, updateUserAction, upsertTemplateAction } from "./actions";
import { ApiKeyForm, WebhookForm } from "@/components/client/api-key-form";
import { revokeApiKeyAction, deleteWebhookAction } from "./api-actions";
import { getEntitlements } from "@/lib/platform/entitlements";
import { ChangePassword } from "@/components/client/change-password";
import { relativeTime, titleCase } from "@/lib/utils/format";

export const metadata = { title: "Settings" };
const TABS = [{ key: "company", label: "Company" }, { key: "operations", label: "Operations & proof" }, { key: "invoicing", label: "Invoicing & tax" }, { key: "notifications", label: "Notifications" }, { key: "team", label: "Team & roles" }, { key: "api", label: "API & webhooks" }, { key: "security", label: "My account" }];

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const sp = await searchParams;
  const tab = TABS.some((t) => t.key === sp.tab) ? sp.tab! : "company";
  const ctx = await requirePageContext("settings.manage");
  const [company, settings] = await Promise.all([prisma.company.findUniqueOrThrow({ where: { id: ctx.companyId } }), ctx.db.companySettings.findFirstOrThrow()]);
  const wh = settings.workingHours as { start: string; end: string; days: number[] };
  const proof = settings.proofRequirements as Record<string, boolean>, hv = settings.highValueProof as Record<string, boolean>, drv = settings.driverRequirements as Record<string, boolean>, dispatch = settings.dispatchRules as { autoAssign?: boolean; maxStopsPerRun?: number };
  const bank = (settings.bankDetails ?? {}) as Record<string, string>;
  const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return (
    <>
      <PageHeader title="Settings" subtitle="Company profile, delivery rules and team" />
      <Tabs tabs={TABS} active={tab} basePath="/settings" />

      {tab === "company" && <Card className="max-w-3xl"><div className="p-5">
        <Form action={updateCompanyAction} successMessage="Company profile saved">
          <LogoField current={company.logoUrl} />
          <FieldGrid><Field name="name" label="Company name" required defaultValue={company.name} /><Field name="businessType" label="Business type" defaultValue={company.businessType ?? ""} placeholder="Last-mile courier, 3PL…" /></FieldGrid>
          <FieldGrid><Field name="registrationNumber" label="Registration number (RC)" defaultValue={company.registrationNumber ?? ""} /><Field name="taxId" label="Tax ID" defaultValue={company.taxId ?? ""} /></FieldGrid>
          <FieldGrid><Field name="email" label="Email" type="email" defaultValue={company.email ?? ""} /><Field name="phone" label="Phone" defaultValue={company.phone ?? ""} /></FieldGrid>
          <Field name="website" label="Website" type="url" defaultValue={company.website ?? ""} /><Field name="addressLine" label="Address" defaultValue={company.addressLine ?? ""} />
          <FieldGrid cols={3}><Field name="city" label="City" defaultValue={company.city ?? ""} /><Field name="state" label="State" defaultValue={company.state ?? ""} /><Field name="country" label="Country (ISO-2)" defaultValue={company.country} maxLength={2} /></FieldGrid>
          <FieldGrid cols={3}><Field name="currency" label="Currency (ISO-4217)" defaultValue={company.currency} maxLength={3} /><Field name="timezone" label="Timezone" defaultValue={company.timezone} /><Field name="operatingRegions" label="Operating regions" defaultValue={company.operatingRegions.join(", ")} hint="Comma separated" /></FieldGrid>
        </Form></div></Card>}

      {tab === "operations" && <Card className="max-w-4xl"><div className="p-5">
        <Form action={updateOperationsAction} successMessage="Operations settings saved">
          <h3 className="text-sm font-semibold">Numbering & service</h3>
          <FieldGrid cols={3}><Field name="shipmentPrefix" label="Order number prefix" defaultValue={settings.shipmentPrefix} required /><Field name="trackingPrefix" label="Tracking prefix (2–4)" defaultValue={settings.trackingPrefix} required /><Field name="invoicePrefix" label="Invoice prefix" defaultValue={settings.invoicePrefix} required /></FieldGrid>
          <FieldGrid cols={3}><Field name="defaultServiceHours" label="Standard delivery window (hours)" type="number" defaultValue={settings.defaultServiceHours} /><Field name="maxDeliveryAttempts" label="Max delivery attempts" type="number" defaultValue={settings.maxDeliveryAttempts} /><Field name="expiryAlertDays" label="Expiry alert days" defaultValue={settings.expiryAlertDays.join(",")} hint="Alert this many days before documents expire" /></FieldGrid>
          <h3 className="pt-2 text-sm font-semibold">Working hours</h3>
          <FieldGrid cols={3}><Field name="workStart" label="Opens" type="time" defaultValue={wh.start} /><Field name="workEnd" label="Closes" type="time" defaultValue={wh.end} /></FieldGrid>
          <div className="flex flex-wrap gap-4">{DAYS.map((d, i) => <CheckboxField key={d} name="workDays[]" value={String(i)} label={d} defaultChecked={wh.days.includes(i)} />)}</div>
          <h3 className="pt-2 text-sm font-semibold">Cash on delivery & returns</h3>
          <FieldGrid><CheckboxField name="codEnabled" label="Enable cash on delivery" defaultChecked={settings.codEnabled} /><Field name="codFeePercent" label="Default COD fee %" type="number" step="0.01" defaultValue={Number(settings.codFeePercent)} /></FieldGrid>
          <TextareaField name="returnPolicy" label="Return policy" defaultValue={settings.returnPolicy ?? ""} />
          <h3 className="pt-2 text-sm font-semibold">Dispatch & drivers</h3>
          <FieldGrid cols={3}><CheckboxField name="autoAssign" label="Auto-assign (reserved)" hint="Not active in this release" defaultChecked={dispatch.autoAssign} /><Field name="maxStopsPerRun" label="Max stops per run" type="number" defaultValue={dispatch.maxStopsPerRun ?? 15} /></FieldGrid>
          <FieldGrid><CheckboxField name="licenseRequired" label="Drivers must have a licence on file" defaultChecked={drv.licenseRequired} /><CheckboxField name="vehicleRequired" label="Drivers must have a vehicle assigned" defaultChecked={drv.vehicleRequired} /></FieldGrid>
          <h3 className="pt-2 text-sm font-semibold">Proof of delivery — standard shipments</h3>
          <div className="flex flex-wrap gap-5"><CheckboxField name="proofRecipientName" label="Recipient name" defaultChecked={proof.recipientName} /><CheckboxField name="proofPhoto" label="Photo" defaultChecked={proof.photo} /><CheckboxField name="proofSignature" label="Signature" defaultChecked={proof.signature} /><CheckboxField name="proofOtp" label="OTP" defaultChecked={proof.otp} /><CheckboxField name="proofGps" label="GPS location" defaultChecked={proof.gps} /></div>
          <h3 className="pt-2 text-sm font-semibold">Proof of delivery — high-value shipments</h3>
          <Field name="hvThreshold" label={`Declared value at or above (${company.currency})`} type="number" defaultValue={Number(settings.highValueThreshold)} hint="0 disables the high-value rule" className="max-w-xs" />
          <div className="flex flex-wrap gap-5"><CheckboxField name="hvRecipientName" label="Recipient name" defaultChecked={hv.recipientName} /><CheckboxField name="hvPhoto" label="Photo" defaultChecked={hv.photo} /><CheckboxField name="hvSignature" label="Signature" defaultChecked={hv.signature} /><CheckboxField name="hvOtp" label="OTP" defaultChecked={hv.otp} /><CheckboxField name="hvGps" label="GPS location" defaultChecked={hv.gps} /></div>
        </Form></div></Card>}

      {tab === "invoicing" && <Card className="max-w-2xl"><div className="p-5"><Form action={updateInvoicingAction} successMessage="Invoicing settings saved">
        <FieldGrid><Field name="taxRatePercent" label="Tax rate (%)" type="number" step="0.01" defaultValue={Number(settings.taxRatePercent)} /><CheckboxField name="taxInclusive" label="Delivery fees already include tax" defaultChecked={settings.taxInclusive} /></FieldGrid>
        <Field name="invoiceFooter" label="Invoice footer" defaultValue={settings.invoiceFooter ?? ""} />
        <h3 className="pt-2 text-sm font-semibold">Bank details shown on invoices</h3>
        <FieldGrid cols={3}><Field name="bank" label="Bank" defaultValue={bank.bank ?? ""} /><Field name="accountName" label="Account name" defaultValue={bank.accountName ?? ""} /><Field name="accountNumber" label="Account number" defaultValue={bank.accountNumber ?? ""} /></FieldGrid>
      </Form></div></Card>}

      {tab === "notifications" && <NotificationsTab settings={settings} ctx={ctx} />}

      {tab === "team" && <TeamTab ctx={ctx} />}
      {tab === "api" && <ApiTab ctx={ctx} />}
      {tab === "security" && <Card className="max-w-md"><CardHeader title="Change password" subtitle="You'll be signed out on all devices." /><div className="p-5"><ChangePassword action={changeOwnPasswordAction} /></div></Card>}
    </>
  );
}

async function NotificationsTab({ settings, ctx }: { settings: { enabledChannels: string[] }; ctx: Awaited<ReturnType<typeof requirePageContext>> }) {
  const status = providerStatus();
  const templates = await ctx.db.messageTemplate.findMany();
  const events = Object.keys(DEFAULT_TEMPLATES) as (keyof typeof DEFAULT_TEMPLATES)[];
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card><CardHeader title="Channels" subtitle="Only enabled channels with working provider credentials are ever used." /><div className="p-5">
        <Form action={updateChannelsAction} successMessage="Channels saved">
          <CheckboxField name="channels[]" value="IN_APP" label="In-app (always on)" defaultChecked />
          {(["EMAIL", "SMS", "WHATSAPP", "PUSH"] as const).map((c) => (
            <div key={c} className="flex items-start justify-between gap-3"><CheckboxField name="channels[]" value={c} label={titleCase(c)} defaultChecked={settings.enabledChannels.includes(c)} hint={`Provider: ${status[c].provider}`} />
              <Badge tone={status[c].configured ? "success" : "warning"}>{status[c].configured ? "Credentials set" : "Not configured"}</Badge></div>))}
        </Form>
        <Alert tone="info"><span className="text-xs">Provider credentials are server-side environment variables (EMAIL_PROVIDER_KEY, SMS_PROVIDER_KEY, WHATSAPP_PROVIDER_KEY…). A channel without credentials is skipped and logged as “not configured”; nothing is reported as sent.</span></Alert>
      </div></Card>
      <Card><CardHeader title="Customer message templates" subtitle="Variables: {{recipientName}} {{senderName}} {{trackingNumber}} {{trackingUrl}} {{company}} {{otp}}" />
        <ul className="divide-y divide-line">{events.map((e) => { const t = templates.find((x) => x.event === e && x.channel === "SMS"); return (
          <li key={e} className="flex items-start justify-between gap-3 px-5 py-3"><div className="min-w-0"><p className="text-sm font-medium">{titleCase(e.replace("shipment.", ""))}</p><p className="truncate text-xs text-slate-500">{t?.body ?? DEFAULT_TEMPLATES[e]}</p></div>
            <ModalForm trigger="Edit" triggerClassName="btn-secondary btn-sm" title={`Template: ${e}`} action={upsertTemplateAction} extra={{ event: e }}><SelectField name="channel" label="Channel" defaultValue="SMS" options={[{ value: "SMS", label: "SMS" }, { value: "WHATSAPP", label: "WhatsApp" }, { value: "EMAIL", label: "Email" }]} /><Field name="subject" label="Subject (email)" /><TextareaField name="body" label="Message" required defaultValue={t?.body ?? DEFAULT_TEMPLATES[e]} /></ModalForm></li>); })}</ul></Card>
    </div>
  );
}

async function TeamTab({ ctx }: { ctx: Awaited<ReturnType<typeof requirePageContext>> }) {
  const [users, branches] = await Promise.all([ctx.db.user.findMany({ where: { role: { notIn: ["CUSTOMER", "SENDER", "RECIPIENT"] } }, orderBy: [{ isActive: "desc" }, { name: "asc" }], include: { branch: { select: { name: true } } } }), ctx.db.branch.findMany({ select: { id: true, name: true } })]);
  const roles = [...ASSIGNABLE_ROLES, ...(ctx.user.role === "COMPANY_OWNER" ? (["COMPANY_OWNER"] as const) : [])];
  const roleOpts = roles.map((r) => ({ value: r, label: ROLE_LABELS[r] }));
  const groups = Array.from(new Set(PERMISSIONS.filter((p) => !p.startsWith("platform.") && !p.startsWith("portal.")).map((p) => p.split(".")[0])));
  return (
    <Card><CardHeader title="Team & roles" subtitle="Permissions come from the role; grant or revoke individual permissions per user." action={
      <ModalForm trigger="Add team member" triggerClassName="btn-primary btn-sm" title="Add team member" action={createUserAction}>
        <FieldGrid><Field name="name" label="Full name" required /><Field name="email" label="Email" type="email" required /></FieldGrid><FieldGrid><SelectField name="role" label="Role" required options={roleOpts} /><SelectField name="branchId" label="Branch" placeholder="All" options={branches.map((b) => ({ value: b.id, label: b.name }))} /></FieldGrid>
        <Field name="phone" label="Phone" /><Field name="password" label="Temporary password" type="password" required minLength={10} hint="Share securely; they can change it under My account." /></ModalForm>} />
      <Table><THead><TH>Name</TH><TH>Role</TH><TH>Branch</TH><TH>Last sign-in</TH><TH>Status</TH><TH>{""}</TH></THead><TBody>
        {users.map((u) => { const base = new Set<string>(ROLE_PERMISSIONS[u.role]); return (
          <TR key={u.id}><TD><span className="font-medium">{u.name}</span><div className="text-xs text-slate-500">{u.email}</div></TD><TD>{ROLE_LABELS[u.role]}{(u.extraPermissions.length > 0 || u.deniedPermissions.length > 0) && <Badge tone="warning" className="ml-2">custom</Badge>}</TD><TD>{u.branch?.name ?? "All"}</TD><TD className="text-xs text-slate-500">{u.lastLoginAt ? relativeTime(u.lastLoginAt) : "Never"}</TD><TD><Badge tone={u.isActive ? "success" : "neutral"}>{u.isActive ? "Active" : "Disabled"}</Badge></TD>
            <TD className="whitespace-nowrap text-right">{u.id !== ctx.user.id && (<>
              <ModalForm trigger="Edit" triggerClassName="btn-secondary btn-sm" title={`Edit ${u.name}`} action={updateUserAction} extra={{ id: u.id }} wide>
                <FieldGrid><SelectField name="role" label="Role" defaultValue={u.role} options={roleOpts.concat(roleOpts.some((o) => o.value === u.role) ? [] : [{ value: u.role, label: ROLE_LABELS[u.role] }])} /><SelectField name="branchId" label="Branch" placeholder="All" defaultValue={u.branchId ?? ""} options={branches.map((b) => ({ value: b.id, label: b.name }))} /></FieldGrid>
                <details className="rounded-lg border border-line p-3"><summary className="cursor-pointer text-sm font-medium">Extra permissions (beyond the role)</summary><div className="mt-3 grid gap-3 sm:grid-cols-2">{groups.map((g) => <div key={g}><p className="text-xs font-semibold uppercase text-slate-500">{g}</p>{PERMISSIONS.filter((p) => p.startsWith(g + ".") && !base.has(p) && !p.startsWith("platform.") && !p.startsWith("portal.")).map((p) => <CheckboxField key={p} name="extraPermissions[]" value={p} label={p} defaultChecked={u.extraPermissions.includes(p)} />)}</div>)}</div></details>
                <details className="rounded-lg border border-line p-3"><summary className="cursor-pointer text-sm font-medium">Revoked permissions (taken away from the role)</summary><div className="mt-3 grid gap-3 sm:grid-cols-2">{groups.map((g) => <div key={g}><p className="text-xs font-semibold uppercase text-slate-500">{g}</p>{PERMISSIONS.filter((p) => p.startsWith(g + ".") && base.has(p)).map((p) => <CheckboxField key={p} name="deniedPermissions[]" value={p} label={p} defaultChecked={u.deniedPermissions.includes(p)} />)}</div>)}</div></details>
                <p className="text-xs text-slate-500">Saving signs the user out everywhere so changes apply immediately.</p>
              </ModalForm>
              <ModalForm trigger="Reset password" triggerClassName="btn-ghost btn-sm" title={`Reset password — ${u.name}`} action={resetPasswordAction} extra={{ id: u.id }}><Field name="password" label="New password" type="password" required minLength={10} /></ModalForm>
              <ActionButton small variant="ghost" label={u.isActive ? "Disable" : "Enable"} confirm={u.isActive ? `Disable ${u.name}? They will be signed out.` : `Re-enable ${u.name}?`} action={updateUserAction} args={{ id: u.id, isActive: !u.isActive }} /></>)}</TD></TR>); })}</TBody></Table></Card>
  );
}

async function ApiTab({ ctx }: { ctx: Awaited<ReturnType<typeof requirePageContext>> }) {
  const [ent, keys, hooks, customers] = await Promise.all([getEntitlements(ctx.companyId), ctx.db.apiKey.findMany({ orderBy: { createdAt: "desc" } }), ctx.db.webhookEndpoint.findMany({ orderBy: { createdAt: "desc" } }), ctx.db.customer.findMany({ where: { type: "CORPORATE" }, select: { id: true, name: true } })]);
  if (!ent.features.has("api_access")) return <Alert tone="warning" title="API access is not on your plan">Upgrade to Premium to create API keys and webhooks.</Alert>;
  const manage = ctx.can("api.manage");
  return (
    <div className="space-y-4">
      <Card><CardHeader title="API keys" subtitle="Base URL: /api/v1 · Authorization: Bearer <key> · see docs/API.md" action={manage && <ApiKeyForm customers={customers} />} />
        <Table><THead><TH>Name</TH><TH>Key</TH><TH>Scopes</TH><TH>Restricted to</TH><TH>Last used</TH><TH>{""}</TH></THead><TBody>
          {keys.map((k) => <TR key={k.id}><TD className="font-medium">{k.name}{k.revokedAt && <Badge className="ml-2">Revoked</Badge>}</TD><TD className="font-mono text-xs">{k.prefix}…</TD><TD className="text-xs">{k.scopes.join(", ")}</TD><TD>{customers.find((c) => c.id === k.customerId)?.name ?? "Whole company"}</TD><TD className="text-xs text-slate-500">{k.lastUsedAt ? relativeTime(k.lastUsedAt) : "Never"}</TD><TD className="text-right">{manage && !k.revokedAt && <ActionButton small variant="ghost" label="Revoke" confirm="Revoke this key? Integrations using it stop working immediately." action={revokeApiKeyAction} args={{ id: k.id }} />}</TD></TR>)}
          {!keys.length && <TR><TD colSpan={6} className="text-center text-slate-500">No API keys</TD></TR>}</TBody></Table></Card>
      <Card><CardHeader title="Webhooks" subtitle="Signed with HMAC-SHA256: X-Webhook-Signature = v1=HMAC(secret, timestamp + '.' + body)" action={manage && <WebhookForm />} />
        <Table><THead><TH>URL</TH><TH>Events</TH><TH>{""}</TH></THead><TBody>{hooks.map((h) => <TR key={h.id}><TD className="font-mono text-xs">{h.url}</TD><TD className="text-xs">{h.events.join(", ")}</TD><TD className="text-right">{manage && <ActionButton small variant="ghost" label="Delete" confirm="Delete this webhook?" action={deleteWebhookAction} args={{ id: h.id }} />}</TD></TR>)}{!hooks.length && <TR><TD colSpan={3} className="text-center text-slate-500">No webhooks</TD></TR>}</TBody></Table></Card>
    </div>
  );
}
