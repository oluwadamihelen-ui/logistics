import type { MetadataRoute } from "next";

const base = () => (process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXTAUTH_URL ?? "http://localhost:3000").replace(/\/$/, "");

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: ["/", "/about", "/terms", "/privacy", "/track"], disallow: ["/api/", "/dashboard", "/shipments", "/driver", "/portal", "/platform", "/settings", "/billing", "/book/", "/track/"] }],
    sitemap: `${base()}/sitemap.xml`,
  };
}
