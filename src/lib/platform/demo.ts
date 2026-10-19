/**
 * Demo mode (DEMO_MODE=1). For a SEPARATE public demo deployment with its own database seeded with sample data
 * (`npm run db:seed`). Demo accounts and their password are public by design — never enable this on a real deployment.
 */
import { AppError } from "./errors";

export const isDemo = () => process.env.DEMO_MODE === "1";

export interface DemoAccount { key: string; label: string; email: string; blurb: string; password?: never }

export const DEMO_ACCOUNTS: DemoAccount[] = [
  { key: "owner", label: "Company owner", email: "owner@swiftdrop.test", blurb: "Everything: dashboard, finance, settings" },
  { key: "dispatch", label: "Dispatch manager", email: "dispatch@swiftdrop.test", blurb: "Dispatch board, drivers, live map" },
  { key: "accountant", label: "Accountant", email: "finance@swiftdrop.test", blurb: "COD, invoices, settlements" },
  { key: "driver", label: "Driver (mobile app)", email: "driver1@swiftdrop.test", blurb: "Tasks, proof of delivery, offline queue" },
  { key: "portal", label: "Customer portal", email: "portal@meridian.test", blurb: "Book and follow shipments as a customer" },
  { key: "admin", label: "Platform admin", email: "admin@platform.test", blurb: "Companies, plans and payments (read-only)" },
];

export const demoPassword = () => process.env.DEMO_PASSWORD ?? process.env.SEED_PASSWORD ?? "SwiftDrop#2026";

/** Throws in demo mode for actions that could lock others out, send things, take money or abuse the host. */
export function assertNotDemo(what: string): void {
  if (isDemo()) throw new AppError("FORBIDDEN", `${what} is turned off in the demo. Start a free trial to use it with your own data.`);
}
