/**
 * Central brand configuration. Change values here (or override with NEXT_PUBLIC_* env vars)
 * and the whole app re-brands, including the "a product of …" attribution.
 */
export const brand = {
  APP_NAME: process.env.NEXT_PUBLIC_APP_NAME ?? "LogisticOS",
  APP_TAGLINE: process.env.NEXT_PUBLIC_APP_TAGLINE ?? "The Logistics Operating System",
  /** Square app mark on a white tile — works on both light and dark backgrounds. */
  APP_LOGO: process.env.NEXT_PUBLIC_APP_LOGO ?? "/logo-tile.png",
  /** Horizontal logo (mark + wordmark) for light backgrounds. */
  APP_WORDMARK: process.env.NEXT_PUBLIC_APP_WORDMARK ?? "/logo-wordmark.png",
  /** Full logo with tagline for light backgrounds (documents, emails). */
  APP_LOGO_FULL: process.env.NEXT_PUBLIC_APP_LOGO_FULL ?? "/logo-full.png",
  APP_ICON: process.env.NEXT_PUBLIC_APP_ICON ?? "/favicon.ico",
  /** RGB triplets (no commas) so Tailwind can apply alpha. */
  PRIMARY_COLOR: process.env.NEXT_PUBLIC_PRIMARY_COLOR ?? "15 98 254",
  PRIMARY_COLOR_DARK: process.env.NEXT_PUBLIC_PRIMARY_COLOR_DARK ?? "10 62 178",
  SECONDARY_COLOR: process.env.NEXT_PUBLIC_SECONDARY_COLOR ?? "255 140 0",
  /** Legal owner / publisher of the product, shown in footers, legal pages and metadata. */
  COMPANY_NAME: process.env.NEXT_PUBLIC_COMPANY_NAME ?? "Numi Innovations LTD",
  COMPANY_URL: process.env.NEXT_PUBLIC_COMPANY_URL ?? "",
  COMPANY_ADDRESS: process.env.NEXT_PUBLIC_COMPANY_ADDRESS ?? "",
  COMPANY_COUNTRY: process.env.NEXT_PUBLIC_COMPANY_COUNTRY ?? "Nigeria",
  /** Where privacy / data-protection requests go. Falls back to the support address. */
  PRIVACY_EMAIL: process.env.NEXT_PUBLIC_PRIVACY_EMAIL ?? process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? "support@example.com",
  SUPPORT_EMAIL: process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? "support@example.com",
  WEBSITE_URL: process.env.NEXT_PUBLIC_WEBSITE_URL ?? "https://example.com",
} as const;

export type Brand = typeof brand;
