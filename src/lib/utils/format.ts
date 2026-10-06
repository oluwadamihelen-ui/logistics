import { clsx, type ClassValue } from "clsx";

export const cn = (...v: ClassValue[]) => clsx(v);

export function money(amount: number | string | null | undefined, currency = "NGN"): string {
  const n = Number(amount ?? 0);
  try {
    return new Intl.NumberFormat("en-NG", { style: "currency", currency, maximumFractionDigits: 2, minimumFractionDigits: n % 1 === 0 ? 0 : 2 }).format(n);
  } catch {
    return `${currency} ${n.toFixed(2)}`;
  }
}

export function compactMoney(amount: number, currency = "NGN"): string {
  const sym = currency === "NGN" ? "₦" : "";
  const abs = Math.abs(amount);
  const f = (v: number, s: string) => `${amount < 0 ? "-" : ""}${sym}${(v).toFixed(v >= 100 ? 0 : 1).replace(/\.0$/, "")}${s}`;
  if (abs >= 1e9) return f(abs / 1e9, "b");
  if (abs >= 1e6) return f(abs / 1e6, "m");
  if (abs >= 1e3) return f(abs / 1e3, "k");
  return `${amount < 0 ? "-" : ""}${sym}${abs}`;
}

export function dateTime(d: Date | string | null | undefined, tz?: string): string {
  if (!d) return "—";
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: tz }).format(new Date(d));
}
export function dateOnly(d: Date | string | null | undefined, tz?: string): string {
  if (!d) return "—";
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeZone: tz }).format(new Date(d));
}
export function timeOnly(d: Date | string, tz?: string): string {
  return new Intl.DateTimeFormat("en-GB", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: tz }).format(new Date(d));
}

export function relativeTime(d: Date | string): string {
  const diff = Date.now() - new Date(d).getTime();
  const s = Math.round(diff / 1000);
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.round(h / 24);
  return days < 30 ? `${days}d ago` : dateOnly(d);
}

export function pct(n: number, digits = 0) {
  return `${n.toFixed(digits)}%`;
}

export function titleCase(s: string) {
  return s.toLowerCase().replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function initials(name: string) {
  return name.split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("");
}

/** Serialise Prisma Decimal/Date-heavy objects for client components. */
export function plain<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}
