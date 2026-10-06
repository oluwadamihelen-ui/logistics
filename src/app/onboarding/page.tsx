import Link from "next/link";
import { redirect } from "next/navigation";
import Image from "next/image";
import { CheckboxField, Field, FieldGrid, Form, TextareaField } from "@/components/client/form";
import { LogoField } from "@/components/client/logo-field";
import { providerStatus } from "@/lib/platform/notifications/providers";
import { requirePageContext } from "@/lib/platform/context";
import { prisma } from "@/lib/platform/db";
import { brand } from "@/config/brand";
import { finishOnboardingAction, onboardBillingAction, onboardCompanyAction, onboardNetworkAction, onboardOperationsAction, onboardPricingAction } from "./actions";
import { cn } from "@/lib/utils/format";
import { Badge } from "@/components/ui";

export const metadata = { title: "Set up your company" };
export const dynamic = "force-dynamic";
const STEPS = ["Company", "Network", "Zones & pricing", "Operations", "Invoicing", "Notifications"];

export default async function Onboarding({ searchParams }: { searchParams: Promise<{ step?: string }> }) {
  const sp = await searchParams;
  const ctx = await requirePageContext("settings.manage");
  const company = await prisma.company.findUniqueOrThrow({ where: { id: ctx.companyId } });
  if (company.onboardedAt && !sp.step) redirect("/dashboard");
  const settings = await ctx.db.companySettings.findFirstOrThrow();
  const step = Math.max(0, Math.min(5, sp.step !== undefined ? Number(sp.step) || 0 : company.onboardingStep));
  const next = (n: number) => `/onboarding?step=${n}`;
  const proof = settings.proofRequirements as Record<string, boolean>;
  const status = providerStatus();
  return (
    <div className="min-h-screen bg-surface">
      <header className="flex items-center gap-2.5 bg-ink px-6 py-4 text-white"><Image src={brand.APP_LOGO} alt="" width={28} height={28} unoptimized /><span className="font-semibold">{brand.APP_NAME}</span><span className="ml-auto text-sm text-slate-300">Company setup</span></header>
      <main className="mx-auto max-w-3xl px-4 py-8">
        <ol className="mb-8 grid grid-cols-6 gap-1 text-center text-[11px]">{STEPS.map((s, i) => <li key={s}><Link href={next(i)} className={cn("block rounded-md py-1.5 font-medium", i === step ? "bg-brand text-white" : i < company.onboardingStep ? "bg-emerald-50 text-emerald-700" : "bg-white text-slate-400 ring-1 ring-line")}>{i + 1}. {s}</Link></li>)}</ol>
        <div className="card p-6">
          {step === 0 && <><h1 className="text-lg font-semibold">Tell us about your company</h1><p className="mb-4 text-sm text-slate-500">This appears on invoices and tracking pages.</p>
            <Form action={onboardCompanyAction} redirectTo={next(1)} submitLabel="Save & continue" successMessage="">
              <LogoField current={company.logoUrl} />
              <FieldGrid><Field name="name" label="Company name" required defaultValue={company.name} /><Field name="businessType" label="Business type" defaultValue={company.businessType ?? ""} placeholder="Last-mile courier, 3PL, food delivery…" /></FieldGrid>
              <FieldGrid><Field name="registrationNumber" label="Registration number (RC)" defaultValue={company.registrationNumber ?? ""} /><Field name="phone" label="Phone" defaultValue={company.phone ?? ""} /></FieldGrid>
              <FieldGrid><Field name="email" label="Email" type="email" defaultValue={company.email ?? ""} /><Field name="website" label="Website" type="url" defaultValue={company.website ?? ""} /></FieldGrid>
              <Field name="addressLine" label="Address" defaultValue={company.addressLine ?? ""} />
              <FieldGrid cols={3}><Field name="city" label="City" defaultValue={company.city ?? ""} /><Field name="state" label="State" defaultValue={company.state ?? ""} /><Field name="country" label="Country (ISO-2)" maxLength={2} defaultValue={company.country} /></FieldGrid>
              <FieldGrid cols={3}><Field name="currency" label="Currency" maxLength={3} defaultValue={company.currency} /><Field name="timezone" label="Timezone" defaultValue={company.timezone} /><Field name="operatingRegions" label="Operating regions" defaultValue={company.operatingRegions.join(", ")} hint="Comma separated" /></FieldGrid>
            </Form></>}
          {step === 1 && <><h1 className="text-lg font-semibold">Your first branch and hub</h1><p className="mb-4 text-sm text-slate-500">Add more branches, hubs and warehouses later under Hubs &amp; branches.</p>
            <Form action={onboardNetworkAction} redirectTo={next(2)} submitLabel="Save & continue" successMessage="">
              <FieldGrid><Field name="branchName" label="Branch name" required placeholder="Ikeja Branch" /><Field name="branchCode" label="Branch code" required placeholder="IKJ" /></FieldGrid>
              <FieldGrid><Field name="city" label="City" /><Field name="state" label="State" /></FieldGrid><Field name="hubName" label="Hub / warehouse name (optional)" placeholder="Ikeja Sorting Hub" /></Form></>}
          {step === 2 && <><h1 className="text-lg font-semibold">Delivery zones & starting prices</h1><p className="mb-4 text-sm text-slate-500">We&apos;ll generate real pricing rules from these numbers. You can refine each rule afterwards.</p>
            <Form action={onboardPricingAction} redirectTo={next(3)} submitLabel="Create zones & rules" successMessage="">
              <TextareaField name="zones" label="Zones — one per line as “Name: area, area”" required rows={5} defaultValue={"Lagos Mainland: Ikeja, Yaba, Surulere\nLagos Island: Lekki, Victoria Island, Ikoyi"} />
              <FieldGrid cols={3}><Field name="sameZoneFee" label={`Within a zone (${company.currency})`} type="number" required defaultValue="1800" /><Field name="crossZoneFee" label="Between zones" type="number" required defaultValue="2800" /><Field name="interstateFee" label="Interstate" type="number" required defaultValue="6500" /></FieldGrid>
              <FieldGrid><Field name="includedKg" label="Included weight (kg)" type="number" defaultValue="5" /><Field name="perKgFee" label="Per extra kg" type="number" defaultValue="150" /></FieldGrid>
              <p className="text-xs text-slate-500">Already have pricing? Skip this step and add rules under Pricing. <Link href={next(3)} className="font-medium text-brand">Skip →</Link></p></Form></>}
          {step === 3 && <><h1 className="text-lg font-semibold">Operations & proof of delivery</h1>
            <Form action={onboardOperationsAction} redirectTo={next(4)} submitLabel="Save & continue" successMessage="">
              <FieldGrid cols={3}><Field name="shipmentPrefix" label="Order number prefix" required defaultValue={settings.shipmentPrefix} /><Field name="defaultServiceHours" label="Standard delivery window (hrs)" type="number" defaultValue={settings.defaultServiceHours} /><span /></FieldGrid>
              <FieldGrid><Field name="workStart" label="Opens" type="time" defaultValue="08:00" /><Field name="workEnd" label="Closes" type="time" defaultValue="18:00" /></FieldGrid>
              <CheckboxField name="codEnabled" label="Offer cash on delivery" defaultChecked={settings.codEnabled} />
              <p className="text-sm font-medium">Required proof of delivery</p><div className="flex flex-wrap gap-5"><CheckboxField name="proofRecipientName" label="Recipient name" defaultChecked={proof.recipientName} /><CheckboxField name="proofPhoto" label="Photo" defaultChecked={proof.photo} /><CheckboxField name="proofSignature" label="Signature" defaultChecked={proof.signature} /><CheckboxField name="proofOtp" label="OTP" defaultChecked={proof.otp} /><CheckboxField name="proofGps" label="GPS" defaultChecked={proof.gps} /></div></Form></>}
          {step === 4 && <><h1 className="text-lg font-semibold">Invoicing & tax</h1>
            <Form action={onboardBillingAction} redirectTo={next(5)} submitLabel="Save & continue" successMessage="">
              <FieldGrid><Field name="taxRatePercent" label="Tax rate (%)" type="number" step="0.01" defaultValue={Number(settings.taxRatePercent)} /><Field name="invoicePrefix" label="Invoice prefix" defaultValue={settings.invoicePrefix} required /></FieldGrid>
              <FieldGrid cols={3}><Field name="bank" label="Bank" /><Field name="accountName" label="Account name" /><Field name="accountNumber" label="Account number" /></FieldGrid></Form></>}
          {step === 5 && <><h1 className="text-lg font-semibold">Notifications</h1><p className="mb-4 text-sm text-slate-500">Choose channels for customer and staff messages. A channel only sends once its provider credentials are configured on the server.</p>
            <Form action={finishOnboardingAction} redirectTo="/dashboard" submitLabel="Finish setup" successMessage="You're all set!">
              <CheckboxField name="channels[]" value="IN_APP" label="In-app" defaultChecked />
              {(["EMAIL", "SMS", "WHATSAPP", "PUSH"] as const).map((c) => <div key={c} className="flex items-center justify-between"><CheckboxField name="channels[]" value={c} label={c[0] + c.slice(1).toLowerCase()} defaultChecked={settings.enabledChannels.includes(c)} /><Badge tone={status[c].configured ? "success" : "warning"}>{status[c].configured ? "Credentials set" : "Not configured on server"}</Badge></div>)}</Form></>}
        </div>
        {step > 0 && <Link href={next(step - 1)} className="mt-4 inline-block text-sm text-slate-500 hover:text-brand">← Back</Link>}
      </main>
    </div>
  );
}
