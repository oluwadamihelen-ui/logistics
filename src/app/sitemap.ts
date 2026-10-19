import type { MetadataRoute } from "next";
import { DOCS } from "@/lib/docs";

const base = () => (process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXTAUTH_URL ?? "http://localhost:3000").replace(/\/$/, "");

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return ["", "/about", "/terms", "/privacy", "/track", "/login", "/register", "/docs", ...DOCS.map((d) => `/docs/${d.slug}`)].map((p) => ({ url: `${base()}${p}`, lastModified: now, changeFrequency: p === "" ? "weekly" : "monthly", priority: p === "" ? 1 : 0.6 }));
}
