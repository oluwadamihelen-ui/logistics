"use client";
import { Suspense } from "react";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { Form, Field, FieldGrid } from "@/components/client/form";
import { registerCompany } from "./actions";
import { brand } from "@/config/brand";

function RegisterForm() {
  const router = useRouter();
  const plan = useSearchParams().get("plan") ?? undefined;
  return (
    <>
      <h1 className="text-2xl font-semibold">Start your free trial</h1>
      <p className="mt-1 text-sm text-slate-500">Set up your logistics company on {brand.APP_NAME} in minutes. No card required.</p>
      <div className="mt-6">
        <Form
          action={registerCompany}
          submitLabel="Create account"
          successMessage=""
          extra={plan ? { planKey: plan } : undefined}
          onSuccess={async (d) => {
            const pw = (document.getElementById("password") as HTMLInputElement | null)?.value;
            await signIn("credentials", { email: d.email, password: pw, redirect: false });
            router.push("/");
            router.refresh();
          }}
        >
          <Field name="companyName" label="Company name" required autoComplete="organization" />
          <FieldGrid>
            <Field name="ownerName" label="Your name" required autoComplete="name" />
            <Field name="phone" label="Phone" type="tel" autoComplete="tel" />
          </FieldGrid>
          <Field name="email" label="Work email" type="email" required autoComplete="email" />
          <Field name="password" label="Password" type="password" required minLength={10} autoComplete="new-password" hint="At least 10 characters, with letters and numbers." />
        </Form>
      </div>
      <p className="mt-6 text-center text-sm text-slate-500">Already have an account? <Link className="font-medium text-brand" href="/login">Sign in</Link></p>
    </>
  );
}

export default function RegisterPage() {
  return <Suspense><RegisterForm /></Suspense>;
}
