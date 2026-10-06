/**
 * Central brand configuration. The product name is not final — change values here
 * (or override with NEXT_PUBLIC_* env vars) and the whole app re-brands.
 */
export const brand = {
  APP_NAME: process.env.NEXT_PUBLIC_APP_NAME ?? "RouteWise",
  APP_TAGLINE: process.env.NEXT_PUBLIC_APP_TAGLINE ?? "The operating system for delivery & logistics",
  APP_LOGO: process.env.NEXT_PUBLIC_APP_LOGO ?? "/logo.svg",
  APP_ICON: process.env.NEXT_PUBLIC_APP_ICON ?? "/icon.svg",
  /** RGB triplets (no commas) so Tailwind can apply alpha. */
  PRIMARY_COLOR: process.env.NEXT_PUBLIC_PRIMARY_COLOR ?? "15 98 254",
  PRIMARY_COLOR_DARK: process.env.NEXT_PUBLIC_PRIMARY_COLOR_DARK ?? "10 62 178",
  SECONDARY_COLOR: process.env.NEXT_PUBLIC_SECONDARY_COLOR ?? "255 140 0",
  SUPPORT_EMAIL: process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? "support@example.com",
  WEBSITE_URL: process.env.NEXT_PUBLIC_WEBSITE_URL ?? "https://example.com",
} as const;

export type Brand = typeof brand;
