import type { Metadata, Viewport } from "next";
import "./globals.css";
import { brand } from "@/config/brand";
import { Providers } from "@/components/client/providers";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXTAUTH_URL ?? "http://localhost:3000"),
  title: { default: `${brand.APP_NAME} — ${brand.APP_TAGLINE}`, template: `%s · ${brand.APP_NAME}` },
  description: `${brand.APP_NAME} is a product of ${brand.COMPANY_NAME}: shipments, dispatch, drivers, fleet, COD and finance in one workspace for delivery and logistics companies.`,
  applicationName: brand.APP_NAME,
  authors: [{ name: brand.COMPANY_NAME, ...(brand.COMPANY_URL ? { url: brand.COMPANY_URL } : {}) }],
  creator: brand.COMPANY_NAME,
  publisher: brand.COMPANY_NAME,
  openGraph: { type: "website", siteName: brand.APP_NAME, title: `${brand.APP_NAME} — ${brand.APP_TAGLINE}`, description: `A product of ${brand.COMPANY_NAME}.`, images: [{ url: "/logo-full.png", width: 1357, height: 344, alt: brand.APP_NAME }] },
  twitter: { card: "summary_large_image", title: brand.APP_NAME, description: brand.APP_TAGLINE, images: ["/logo-full.png"] },
  icons: { icon: [{ url: "/favicon.ico", sizes: "any" }, { url: "/icon.png", type: "image/png", sizes: "512x512" }], apple: "/apple-icon.png" },
  manifest: "/manifest.webmanifest",
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#0f62fe" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" style={{ ["--brand" as any]: brand.PRIMARY_COLOR, ["--brand-dark" as any]: brand.PRIMARY_COLOR_DARK, ["--accent" as any]: brand.SECONDARY_COLOR }}>
      <body><Providers>{children}</Providers></body>
    </html>
  );
}
