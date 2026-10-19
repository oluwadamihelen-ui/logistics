import Link from "next/link";
import { isDemo } from "@/lib/platform/demo";
import { brand } from "@/config/brand";

/** Slim fixed strip shown on every page of a demo deployment. */
export function DemoBanner() {
  if (!isDemo()) return null;
  return (
    <div className="fixed inset-x-0 bottom-0 z-[60] border-t border-amber-300 bg-amber-100 px-4 py-2 text-center text-xs text-amber-950">
      <strong>{brand.APP_NAME} live demo.</strong> Sample data, reset daily. Billing, sign-up, uploads and user management are switched off.{" "}
      <Link href="/login" className="font-semibold underline">Switch role</Link>
      {brand.COMPANY_URL ? <> · <a href={brand.COMPANY_URL} className="font-semibold underline">Get {brand.APP_NAME}</a></> : <> · <a href={`mailto:${brand.SUPPORT_EMAIL}`} className="font-semibold underline">Contact us</a></>}
    </div>
  );
}
