import type { Metadata, Viewport } from "next";
import "./globals.css";
import { brand } from "@/config/brand";
import { Providers } from "@/components/client/providers";

export const metadata: Metadata = {
  title: { default: brand.APP_NAME, template: `%s · ${brand.APP_NAME}` },
  description: brand.APP_TAGLINE,
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
