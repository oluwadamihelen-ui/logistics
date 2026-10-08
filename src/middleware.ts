import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

/**
 * Defence in depth: unauthenticated requests never reach protected pages/APIs.
 * Authorisation (role, permissions, tenant) is still enforced server-side in every page, action and route handler.
 */
const PROTECTED_PAGES = ["/dashboard", "/shipments", "/dispatch", "/map", "/routes", "/hubs", "/customers", "/drivers", "/fleet", "/cod", "/invoices", "/expenses", "/settlements", "/pricing", "/analytics", "/reports", "/assistant", "/notifications", "/support", "/inventory", "/staff", "/documents", "/audit", "/settings", "/billing", "/search", "/driver", "/portal", "/platform", "/onboarding"];
const PROTECTED_API = ["/api/map", "/api/maps", "/api/reports", "/api/documents", "/api/files"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isApi = PROTECTED_API.some((p) => pathname === p || pathname.startsWith(p + "/"));
  const isPage = PROTECTED_PAGES.some((p) => pathname === p || pathname.startsWith(p + "/"));
  if (!isApi && !isPage) return NextResponse.next();
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (token?.uid) return NextResponse.next();
  if (isApi) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = `?callbackUrl=${encodeURIComponent(pathname + req.nextUrl.search)}`;
  return NextResponse.redirect(url);
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.png|icon-192.png|icon-512.png|apple-icon.png|logo-tile.png|logo-wordmark.png|logo-full.png|manifest.webmanifest|sw.js).*)"] };
