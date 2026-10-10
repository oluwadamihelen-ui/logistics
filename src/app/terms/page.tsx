import Link from "next/link";
import { MarketingPage } from "@/components/marketing/marketing-page";
import { brand } from "@/config/brand";

export const metadata = { title: "Terms of Service", description: `The terms that govern use of ${brand.APP_NAME}.` };
const C = brand.COMPANY_NAME, P = brand.APP_NAME;

export default function TermsPage() {
  return (
    <MarketingPage title="Terms of Service" updated="10 October 2026" intro={`These terms govern your use of ${P}, a product of ${C}.`}>
      <p>By creating an account or using {P} you agree to these terms on behalf of yourself and the company you represent (&ldquo;you&rdquo;). If you do not agree, do not use the service. &ldquo;We&rdquo; and &ldquo;us&rdquo; mean {C}.</p>
      <h2>1. The service</h2>
      <p>{P} is a hosted software service for delivery and logistics operations. We may improve, change or retire features, and will give reasonable notice of changes that materially reduce functionality.</p>
      <h2>2. Accounts and security</h2>
      <ul>
        <li>You must provide accurate registration details and keep them up to date.</li>
        <li>You are responsible for activity under your account, including that of users you invite, and for keeping credentials and recovery codes safe. Enable two-factor authentication for administrators.</li>
        <li>Tell us promptly at <a href={`mailto:${brand.SUPPORT_EMAIL}`}>{brand.SUPPORT_EMAIL}</a> if you suspect unauthorised access.</li>
      </ul>
      <h2>3. Your data</h2>
      <p>You own the data you put into {P} (&ldquo;Customer Data&rdquo;), including shipment, customer, driver and financial records. You give us the right to host, process and display it only to provide and secure the service, as described in our <Link href="/privacy">Privacy Policy</Link>. You are responsible for having a lawful basis to collect and use the personal data of your customers, recipients and staff, and for informing them as the law requires.</p>
      <h2>4. Acceptable use</h2>
      <p>You must not: break the law with the service; attempt to access another company&apos;s data; probe or disrupt the service, or bypass its limits or security; resell the service without our written agreement; upload malicious code; or use the service to send unsolicited bulk messages. We may suspend access that threatens the service or other customers.</p>
      <h2>5. Plans, billing and renewal</h2>
      <ul>
        <li>New workspaces start with a free trial where offered. Paid plans are billed in advance, monthly or annually, in the currency shown at checkout. Payments are processed by our payment provider; we do not store full card numbers.</li>
        <li>If you enable automatic renewal, we charge your saved payment method shortly before each period ends until you turn it off or cancel. You can turn renewal off, remove your card or cancel at any time from the Billing page.</li>
        <li>Cancelling stops future charges; you keep access until the end of the paid period. Fees already paid are non-refundable except where the law requires otherwise.</li>
        <li>If a payment fails, we may give a short grace period and then limit the workspace to read-only until payment is made. We will not delete your data solely because of a missed payment without notice.</li>
        <li>Changing plan part-way through a period may be prorated as shown at checkout. Prices may change with at least 30 days&apos; notice before your next renewal.</li>
      </ul>
      <h2>6. Third-party services</h2>
      <p>{P} can connect to third-party services you choose to use, such as payment, SMS, email, messaging and mapping providers. Their terms apply to your use of them, and we are not responsible for their availability.</p>
      <h2>7. Availability and support</h2>
      <p>We work to keep the service available and secure, but we do not guarantee uninterrupted or error-free operation. Planned maintenance is announced where practical. Support is available at <a href={`mailto:${brand.SUPPORT_EMAIL}`}>{brand.SUPPORT_EMAIL}</a>.</p>
      <h2>8. Intellectual property</h2>
      <p>{C} and its licensors own {P}, its software, design and branding. These terms give you a limited, non-exclusive, non-transferable right to use the service during your subscription. Feedback you give us may be used without obligation.</p>
      <h2>9. Warranty disclaimer and liability</h2>
      <p>To the maximum extent permitted by law, the service is provided &ldquo;as is&rdquo; and we disclaim implied warranties. We are not liable for indirect or consequential loss, lost profit or lost data, and our total liability for any claim is limited to the fees you paid us in the 12 months before the event giving rise to the claim. Nothing in these terms limits liability that cannot be limited by law. You remain responsible for your own deliveries, drivers, customers and compliance with transport and tax laws.</p>
      <h2>10. Termination and export</h2>
      <p>You may stop using the service at any time. We may suspend or terminate accounts that breach these terms. After termination you can request an export of your Customer Data within 30 days; after that we may delete it in line with our retention practices.</p>
      <h2>11. Changes to these terms</h2>
      <p>We may update these terms. We will post the new version here and, for material changes, notify account owners. Continued use after the effective date means you accept the update.</p>
      <h2>12. Governing law and contact</h2>
      <p>These terms are governed by the laws of the Federal Republic of Nigeria, and the courts of Nigeria have jurisdiction, unless mandatory law in your country says otherwise. Questions: <a href={`mailto:${brand.SUPPORT_EMAIL}`}>{brand.SUPPORT_EMAIL}</a>{brand.COMPANY_ADDRESS ? `, ${C}, ${brand.COMPANY_ADDRESS}` : ""}.</p>
    </MarketingPage>
  );
}
