import Link from "next/link";
import { MarketingPage } from "@/components/marketing/marketing-page";
import { brand } from "@/config/brand";

export const metadata = { title: `About ${brand.COMPANY_NAME}`, description: `${brand.APP_NAME} is a product of ${brand.COMPANY_NAME}.` };

export default function AboutPage() {
  return (
    <MarketingPage title={`About ${brand.COMPANY_NAME}`} intro={`${brand.APP_NAME} is a product of ${brand.COMPANY_NAME}.`}>
      <p>{brand.COMPANY_NAME} is the company that designs, builds, operates and supports {brand.APP_NAME} — the logistics operating system. When you use {brand.APP_NAME}, {brand.COMPANY_NAME} is the service provider responsible for the platform and, as described in our <Link href="/privacy">Privacy Policy</Link>, the party that processes your data on your behalf.</p>
      <h2>What we make</h2>
      <p>{brand.APP_NAME} gives delivery and logistics companies one workspace for shipments, dispatch, drivers and fleet, cash-on-delivery, finance, customer tracking and reporting.</p>
      <h2>Company details</h2>
      <ul>
        <li>Legal name: {brand.COMPANY_NAME}</li>
        {brand.COMPANY_ADDRESS && <li>Address: {brand.COMPANY_ADDRESS}</li>}
        <li>Country: {brand.COMPANY_COUNTRY}</li>
        <li>General and support enquiries: <a href={`mailto:${brand.SUPPORT_EMAIL}`}>{brand.SUPPORT_EMAIL}</a></li>
        <li>Privacy and data requests: <a href={`mailto:${brand.PRIVACY_EMAIL}`}>{brand.PRIVACY_EMAIL}</a></li>
        {brand.COMPANY_URL && <li>Website: <a href={brand.COMPANY_URL} rel="noopener noreferrer" target="_blank">{brand.COMPANY_URL}</a></li>}
      </ul>
    </MarketingPage>
  );
}
